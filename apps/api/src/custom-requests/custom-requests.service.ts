import { randomUUID } from 'node:crypto';

import type { CheckoutResponse, CreateCustomRequest, CustomOffer, CustomOfferRequest, CustomRequestView } from '@flower-man/contracts';
import { basisPointsOf } from '@flower-man/domain';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';

import type { AuthenticatedContext } from '../auth/auth.guard.js';
import { pointSql } from '../common/geo.js';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { PG_POOL } from '../database/database.module.js';
import { withTransaction } from '../database/transaction.js';
import { euros, NotificationsService } from '../notifications/notifications.service.js';
import { requireVerifiedEmail, validateRequestedDelivery } from '../orders/commerce.service.js';
import { ORDER_SUMMARY_SELECT, toOrderSummary } from '../orders/order-views.js';
import type { ActingPartner } from '../partners/partners.service.js';
import { MAX_PRODUCT_IMAGE_BYTES } from '../catalog/catalog.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { detectImageType, OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import { ZonesService } from '../zones/zones.service.js';

interface RequestRow {
  id: string;
  occasion: string;
  flower_preferences: string | null;
  colour_preferences: string | null;
  notes: string | null;
  budget_minor: number;
  delivery_window_start: Date;
  delivery_window_end: Date;
  delivery_address: string;
  status: CustomRequestView['status'];
  created_at: Date;
  expires_at: Date;
}

interface OfferRow {
  id: string;
  seller_id: string;
  seller_name: string;
  seller_kind: CustomOffer['sellerKind'];
  description: string;
  price_minor: number;
  preparation_minutes: number;
  available_from: Date;
  notes: string | null;
  status: CustomOffer['status'];
  request_id: string;
  image_updated_at: Date | null;
}

const REQUEST_COLUMNS = `r.id, r.occasion, r.flower_preferences, r.colour_preferences, r.notes, r.budget_minor,
  r.delivery_window_start, r.delivery_window_end, r.delivery_address,
  CASE WHEN r.status = 'OPEN' AND r.expires_at <= now() THEN 'EXPIRED' ELSE r.status END AS status, r.created_at, r.expires_at`;

const toOffer = (row: OfferRow): CustomOffer => ({
  id: row.id,
  sellerId: row.seller_id,
  sellerName: row.seller_name,
  sellerKind: row.seller_kind,
  description: row.description,
  priceMinor: row.price_minor,
  preparationMinutes: row.preparation_minutes,
  availableFrom: row.available_from.toISOString(),
  notes: row.notes,
  status: row.status,
  imagePath: row.image_updated_at ? `custom-requests/${row.request_id}/offers/${row.id}/image?v=${row.image_updated_at.getTime()}` : null,
});

const toView = (row: RequestRow, offers: CustomOffer[]): CustomRequestView => ({
  id: row.id,
  occasion: row.occasion,
  flowerPreferences: row.flower_preferences,
  colourPreferences: row.colour_preferences,
  notes: row.notes,
  budgetMinor: row.budget_minor,
  deliveryWindowStart: row.delivery_window_start.toISOString(),
  deliveryWindowEnd: row.delivery_window_end.toISOString(),
  deliveryAddress: row.delivery_address,
  status: row.status,
  createdAt: row.created_at.toISOString(),
  expiresAt: row.expires_at.toISOString(),
  offers,
});

@Injectable()
export class CustomRequestsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly zones: ZonesService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** The seller's photo for their own, still open offer. The type comes from the bytes. */
  async setOfferImage(seller: ActingPartner, requestId: string, bytes: unknown): Promise<CustomOffer> {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new BadRequestException('Send the photo as the request body (Content-Type image/jpeg, image/png or image/webp).');
    }
    if (bytes.length > MAX_PRODUCT_IMAGE_BYTES) {
      throw new BadRequestException('Photo too large (max 5 MB).');
    }
    const type = detectImageType(bytes);
    if (!type) {
      throw new BadRequestException('The photo must be a JPEG, PNG or WebP image.');
    }
    const found = await this.pool.query<{ id: string }>(`SELECT id FROM custom_offers WHERE request_id = $1 AND seller_id = $2 AND status = 'SUBMITTED'`, [requestId, seller.partnerId]);
    const offerId = found.rows[0]?.id;
    if (!offerId) {
      throw new NotFoundException('There is no submitted offer to add a photo to.');
    }
    const key = `offer-images/${offerId}/${randomUUID()}.${type.split('/')[1] as string}`;
    await this.storage.put(key, bytes, type);
    await this.pool.query(`UPDATE custom_offers SET image_key = $2, image_content_type = $3, image_updated_at = now() WHERE id = $1 AND status = 'SUBMITTED'`, [offerId, key, type]);
    return (await this.offers(requestId, true)).find((offer) => offer.id === offerId) as CustomOffer;
  }

  /** Only the request's customer and the members of the offering seller can see the photo. */
  async offerImage(userId: string, requestId: string, offerId: string): Promise<{ bytes: Buffer; contentType: string }> {
    const result = await this.pool.query<{ image_key: string; image_content_type: string }>(
      `SELECT o.image_key, o.image_content_type
         FROM custom_offers o JOIN custom_requests r ON r.id = o.request_id
        WHERE o.id = $2 AND o.request_id = $1 AND o.image_key IS NOT NULL
          AND (r.customer_id = $3 OR EXISTS (SELECT 1 FROM partner_members m WHERE m.partner_id = o.seller_id AND m.user_id = $3))`,
      [requestId, offerId, userId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Photo not found.');
    }
    return { bytes: await this.storage.get(row.image_key), contentType: row.image_content_type };
  }

  // ---------------------------------------------------------------- customer
  async create(auth: AuthenticatedContext, input: CreateCustomRequest): Promise<CustomRequestView> {
    requireVerifiedEmail(auth);
    validateRequestedDelivery(input.deliveryWindowStart);
    const { latitude, longitude } = input.deliveryLocation;
    const zone = await this.zones.requireActiveZone(latitude, longitude);
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO custom_requests (customer_id, occasion, flower_preferences, colour_preferences, notes, budget_minor,
                                    delivery_window_start, delivery_window_end, recipient_name, recipient_phone,
                                    delivery_address, delivery_location, service_zone_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ${pointSql(12, 13)}, $14,
               LEAST(now() + make_interval(hours => $15), $7::timestamptz)) RETURNING id`,
      [
        auth.userId, input.occasion, input.flowerPreferences ?? null, input.colourPreferences ?? null, input.notes ?? null,
        input.budgetMinor, input.deliveryWindowStart, input.deliveryWindowEnd, input.recipientName, input.recipientPhone,
        input.deliveryAddress, longitude, latitude, zone.id, this.config.commerce.customRequestTtlHours,
      ],
    );
    const id = result.rows[0]?.id as string;
    await this.notifications.safely(async () => {
      const sellers = await this.pool.query<{ id: string }>(
        `SELECT id FROM partner_accounts WHERE service_zone_id = $1 AND verification_status = 'APPROVED' AND kind IN ('SHOP', 'FREELANCE_SELLER')`,
        [zone.id],
      );
      for (const seller of sellers.rows) {
        await this.notifications.notifyPartner(seller.id, {
          type: 'CUSTOM_REQUEST_NEW',
          title: { it: 'Nuova richiesta di mazzo personalizzato', en: 'New custom bouquet request' },
          body: { it: `${input.occasion}, budget ${euros(input.budgetMinor).it}`, en: `${input.occasion}, budget ${euros(input.budgetMinor).en}` },
          data: { requestId: id },
        });
      }
    });
    return this.getForCustomer(auth.userId, id);
  }

  async listForCustomer(customerId: string): Promise<CustomRequestView[]> {
    const result = await this.pool.query<RequestRow>(
      `SELECT ${REQUEST_COLUMNS} FROM custom_requests r WHERE r.customer_id = $1 ORDER BY r.created_at DESC LIMIT 100`,
      [customerId],
    );
    return Promise.all(result.rows.map(async (row) => toView(row, await this.offers(row.id))));
  }

  async getForCustomer(customerId: string, requestId: string): Promise<CustomRequestView> {
    const result = await this.pool.query<RequestRow>(`SELECT ${REQUEST_COLUMNS} FROM custom_requests r WHERE r.id = $1 AND r.customer_id = $2`, [requestId, customerId]);
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Request not found.');
    }
    return toView(row, await this.offers(requestId));
  }

  async cancel(customerId: string, requestId: string): Promise<CustomRequestView> {
    const result = await this.pool.query(
      `UPDATE custom_requests SET status = 'CANCELLED' WHERE id = $1 AND customer_id = $2 AND status = 'OPEN'`,
      [requestId, customerId],
    );
    if (result.rowCount !== 1) {
      throw new ConflictException('Only open requests can be cancelled.');
    }
    return this.getForCustomer(customerId, requestId);
  }

  /**
   * Accepts one offer and creates the order. The request row is locked and must still be OPEN:
   * a second concurrent selection (another tab, double tap) fails with 409 instead of creating two orders.
   */
  async selectOffer(auth: AuthenticatedContext, requestId: string, offerId: string): Promise<CheckoutResponse> {
    requireVerifiedEmail(auth);
    const orderId = await withTransaction(this.pool, async (client) => {
      const found = await client.query<{
        status: string;
        expired: boolean;
        occasion: string;
        recipient_name: string;
        recipient_phone: string;
        delivery_address: string;
        service_zone_id: string;
        delivery_window_start: Date;
        notes: string | null;
      }>(
        `SELECT status, expires_at <= now() AS expired, occasion, recipient_name, recipient_phone, delivery_address,
                service_zone_id, delivery_window_start, notes
           FROM custom_requests WHERE id = $1 AND customer_id = $2 FOR UPDATE`,
        [requestId, auth.userId],
      );
      const request = found.rows[0];
      if (!request) {
        throw new NotFoundException('Request not found.');
      }
      if (request.status !== 'OPEN' || request.expired) {
        throw new ConflictException('An offer has already been selected, or the request is closed.');
      }
      const offerResult = await client.query<{ seller_id: string; price_minor: number; seller_ok: boolean; seller_zone: string; description: string }>(
        `SELECT o.seller_id, o.price_minor, p.verification_status = 'APPROVED' AS seller_ok, p.service_zone_id AS seller_zone, o.description
           FROM custom_offers o JOIN partner_accounts p ON p.id = o.seller_id
          WHERE o.id = $1 AND o.request_id = $2 AND o.status = 'SUBMITTED' FOR UPDATE OF o`,
        [offerId, requestId],
      );
      const offer = offerResult.rows[0];
      if (!offer || !offer.seller_ok || offer.seller_zone !== request.service_zone_id) {
        throw new ConflictException('This offer is no longer available.');
      }
      const fee = await client.query<{ delivery_fee_minor: number }>('SELECT delivery_fee_minor FROM service_zones WHERE id = $1', [request.service_zone_id]);
      const deliveryFee = fee.rows[0]?.delivery_fee_minor ?? 0;
      const commission = basisPointsOf(offer.price_minor, this.config.commerce.commissionBasisPoints);

      await client.query(`UPDATE custom_requests SET status = 'OFFER_SELECTED', selected_offer_id = $2 WHERE id = $1`, [requestId, offerId]);
      await client.query(`UPDATE custom_offers SET status = CASE WHEN id = $2 THEN 'ACCEPTED' ELSE 'REJECTED' END WHERE request_id = $1 AND status = 'SUBMITTED'`, [requestId, offerId]);
      const order = await client.query<{ id: string }>(
        `INSERT INTO orders (customer_id, seller_id, source, custom_offer_id, subtotal_minor, delivery_fee_minor, total_minor,
                             platform_commission_minor, recipient_name, recipient_phone, delivery_address, delivery_location,
                             service_zone_id, delivery_notes, requested_delivery_at)
         SELECT $1, $2, 'CUSTOM_REQUEST', $3, $4::int, $5::int, $4::int + $5::int, $6::int, recipient_name, recipient_phone, delivery_address,
                delivery_location, service_zone_id, notes, delivery_window_start
           FROM custom_requests WHERE id = $7 RETURNING id`,
        [auth.userId, offer.seller_id, offerId, offer.price_minor, deliveryFee, commission, requestId],
      );
      const id = order.rows[0]?.id as string;
      await client.query(
        `INSERT INTO order_items (order_id, product_id, name, unit_price_minor, quantity, line_total_minor) VALUES ($1, NULL, $2, $3, 1, $3)`,
        [id, `Custom bouquet: ${request.occasion}`.slice(0, 200), offer.price_minor],
      );
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, actor, actor_user_id, reason) VALUES ($1, NULL, 'PENDING_PAYMENT', 'CUSTOMER', $2, 'Custom offer selected')`,
        [id, auth.userId],
      );
      return id;
    });

    await this.notifications.safely(async () => {
      const offer = await this.pool.query<{ seller_id: string }>('SELECT seller_id FROM custom_offers WHERE id = $1', [offerId]);
      const sellerId = offer.rows[0]?.seller_id;
      if (sellerId) {
        await this.notifications.notifyPartner(sellerId, {
          type: 'CUSTOM_OFFER_SELECTED',
          title: { it: 'La tua offerta è stata scelta', en: 'Your offer was selected' },
          body: { it: 'Il cliente ha scelto il tuo mazzo. Riceverai un avviso appena sarà pagato.', en: 'The customer chose your bouquet. You will be notified once it is paid.' },
          data: { requestId, orderId },
        });
      }
    });
    const payment = await this.payments.instructionsFor(orderId);
    const summary = await this.pool.query(`${ORDER_SUMMARY_SELECT} WHERE o.id = $1`, [orderId]);
    return { order: toOrderSummary(summary.rows[0]), payment };
  }

  // ---------------------------------------------------------------- seller
  /** Open, unexpired requests in the seller's zone. Customer contact details are not shown. */
  async openForSeller(seller: ActingPartner): Promise<(CustomRequestView & { myOffer: CustomOffer | null })[]> {
    const result = await this.pool.query<RequestRow>(
      `SELECT ${REQUEST_COLUMNS} FROM custom_requests r
        WHERE r.service_zone_id = $1 AND r.status = 'OPEN' AND r.expires_at > now() ORDER BY r.delivery_window_start LIMIT 100`,
      [seller.serviceZoneId],
    );
    return Promise.all(
      result.rows.map(async (row) => {
        const mine = (await this.offers(row.id)).find((offer) => offer.sellerId === seller.partnerId) ?? null;
        return { ...toView(row, []), myOffer: mine };
      }),
    );
  }

  async submitOffer(seller: ActingPartner, requestId: string, input: CustomOfferRequest): Promise<CustomOffer> {
    const request = await this.pool.query<{ customer_id: string; occasion: string }>(
      `SELECT customer_id, occasion FROM custom_requests WHERE id = $1 AND status = 'OPEN' AND expires_at > now() AND service_zone_id = $2`,
      [requestId, seller.serviceZoneId],
    );
    const row = request.rows[0];
    if (!row) {
      throw new NotFoundException('This request is not open in your area.');
    }
    if (Date.parse(input.availableFrom) < Date.now() - 60_000) {
      throw new BadRequestException('availableFrom must not be in the past.');
    }
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO custom_offers (request_id, seller_id, description, price_minor, preparation_minutes, available_from, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (request_id, seller_id) DO UPDATE SET description = EXCLUDED.description, price_minor = EXCLUDED.price_minor,
         preparation_minutes = EXCLUDED.preparation_minutes, available_from = EXCLUDED.available_from, notes = EXCLUDED.notes,
         status = 'SUBMITTED', created_at = now()
         WHERE custom_offers.status IN ('SUBMITTED', 'WITHDRAWN')
       RETURNING id`,
      [requestId, seller.partnerId, input.description, input.priceMinor, input.preparationMinutes, input.availableFrom, input.notes ?? null],
    );
    if (!inserted.rows[0]) {
      throw new ConflictException('Your offer can no longer be changed.');
    }
    await this.notifications.safely(() =>
      this.notifications.notifyUser(row.customer_id, {
        type: 'CUSTOM_OFFER_RECEIVED',
        title: { it: 'Nuova offerta per il tuo mazzo', en: 'New offer for your bouquet' },
        body: { it: `${seller.displayName}: ${euros(input.priceMinor).it} per "${row.occasion}"`, en: `${seller.displayName}: ${euros(input.priceMinor).en} for "${row.occasion}"` },
        data: { requestId },
      }),
    );
    const offers = await this.offers(requestId);
    return offers.find((offer) => offer.sellerId === seller.partnerId) as CustomOffer;
  }

  async withdrawOffer(seller: ActingPartner, requestId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE custom_offers SET status = 'WITHDRAWN' WHERE request_id = $1 AND seller_id = $2 AND status = 'SUBMITTED'`,
      [requestId, seller.partnerId],
    );
    if (result.rowCount !== 1) {
      throw new ConflictException('There is no submitted offer to withdraw.');
    }
  }

  async listForAdmin(status?: string): Promise<(CustomRequestView & { customerEmail: string })[]> {
    const result = await this.pool.query<RequestRow & { customer_email: string }>(
      `SELECT ${REQUEST_COLUMNS}, u.email AS customer_email FROM custom_requests r JOIN users u ON u.id = r.customer_id
        WHERE ($1::text IS NULL OR r.status = $1) ORDER BY r.created_at DESC LIMIT 200`,
      [status ?? null],
    );
    return Promise.all(result.rows.map(async (row) => ({ ...toView(row, await this.offers(row.id)), customerEmail: row.customer_email })));
  }

  private async offers(requestId: string, includeWithdrawn = false): Promise<CustomOffer[]> {
    const result = await this.pool.query<OfferRow>(
      `SELECT o.id, o.seller_id, p.display_name AS seller_name, p.kind AS seller_kind, o.description, o.price_minor,
              o.preparation_minutes, o.available_from, o.notes, o.status, o.request_id, o.image_updated_at
         FROM custom_offers o JOIN partner_accounts p ON p.id = o.seller_id
        WHERE o.request_id = $1 AND (o.status <> 'WITHDRAWN' OR $2) ORDER BY o.price_minor`,
      [requestId, includeWithdrawn],
    );
    return result.rows.map(toOffer);
  }
}

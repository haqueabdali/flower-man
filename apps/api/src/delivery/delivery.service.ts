import { createHash, randomUUID } from 'node:crypto';

import type { CourierJob, LocationUpdate } from '@flower-man/contracts';
import { assertDeliveryTransition, type DeliveryStatus, TRACKABLE_DELIVERY_STATUSES } from '@flower-man/domain';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';

import { pointSql, selectPoint, toGeoPoint } from '../common/geo.js';
import { PG_POOL } from '../database/database.module.js';
import { withTransaction } from '../database/transaction.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { type LockedOrder, lockOrder, transitionOrder } from '../orders/order-workflow.js';
import type { ActingPartner } from '../partners/partners.service.js';
import { detectImageType, OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';

/** Average urban courier speed used for the ETA estimate (km/h). */
const ETA_SPEED_KMH = 18;
const MAX_PROOF_BYTES = 8 * 1024 * 1024;

interface JobRow {
  id: string;
  order_id: string;
  order_number: string;
  status: DeliveryStatus;
  fee_minor: number;
  courier_id: string | null;
  pickup_name: string;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_address: string;
  drop_lat: number;
  drop_lng: number;
  recipient_name: string;
  recipient_phone: string;
  distance_m: number | null;
  proof_object_key: string | null;
  requested_delivery_at: Date | null;
}

const JOB_SELECT = (distanceFrom: string | null) => `
  SELECT d.id, d.order_id, o.order_number, d.status, d.fee_minor, d.courier_id,
         s.display_name AS pickup_name, s.address AS pickup_address, ${selectPoint('d.pickup_location', 'pickup')},
         o.delivery_address AS dropoff_address, ${selectPoint('d.dropoff_location', 'drop')},
         o.recipient_name, o.recipient_phone, d.proof_object_key, o.requested_delivery_at,
         ${distanceFrom ? `ST_Distance(d.pickup_location, ${distanceFrom})` : 'NULL::float8'} AS distance_m
    FROM deliveries d JOIN orders o ON o.id = d.order_id JOIN partner_accounts s ON s.id = o.seller_id`;

const toJob = (row: JobRow, holder: boolean): CourierJob => ({
  deliveryId: row.id,
  orderNumber: Number(row.order_number),
  status: row.status,
  feeMinor: row.fee_minor,
  pickupName: row.pickup_name,
  pickupAddress: row.pickup_address,
  pickupLocation: toGeoPoint(row.pickup_lat, row.pickup_lng),
  dropoffAddress: row.dropoff_address,
  dropoffLocation: { latitude: row.drop_lat, longitude: row.drop_lng },
  recipientName: row.recipient_name,
  recipientPhone: holder ? row.recipient_phone : null,
  distanceMeters: row.distance_m === null ? null : Math.round(row.distance_m),
  requestedDeliveryAt: row.requested_delivery_at?.toISOString() ?? null,
});

/** Courier dispatch, tracking, proof and completion. Every state change is checked server-side. */
@Injectable()
export class DeliveryService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Called when the seller marks an order ready: creates an OFFERED job (idempotent). */
  async createJob(client: pg.ClientBase, order: LockedOrder): Promise<void> {
    await client.query(
      `INSERT INTO deliveries (order_id, service_zone_id, pickup_location, dropoff_location, fee_minor)
       SELECT o.id, o.service_zone_id, s.location, o.delivery_location, o.delivery_fee_minor
         FROM orders o JOIN partner_accounts s ON s.id = o.seller_id WHERE o.id = $1
       ON CONFLICT (order_id) DO UPDATE SET status = 'OFFERED', courier_id = NULL, assigned_at = NULL
         WHERE deliveries.status = 'CANCELLED'`,
      [order.id],
    );
  }

  async notifyAvailableCouriers(zoneId: string, orderNumber: number): Promise<void> {
    const couriers = await this.pool.query<{ owner_user_id: string }>(
      `SELECT owner_user_id FROM partner_accounts
        WHERE kind = 'COURIER' AND verification_status = 'APPROVED' AND courier_available AND service_zone_id = $1`,
      [zoneId],
    );
    for (const courier of couriers.rows) {
      await this.notifications.notifyUser(courier.owner_user_id, {
        type: 'DELIVERY_OFFERED',
        title: { it: 'Nuova consegna disponibile', en: 'New delivery job' },
        body: { it: `L'ordine #${orderNumber} è pronto per il ritiro.`, en: `Order #${orderNumber} is ready for pickup.` },
      });
    }
  }

  async offeredJobs(courier: ActingPartner): Promise<CourierJob[]> {
    const available = await this.pool.query<{ courier_available: boolean; lat: number | null; lng: number | null }>(
      `SELECT courier_available, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng FROM partner_accounts WHERE id = $1`,
      [courier.partnerId],
    );
    const me = available.rows[0];
    if (!me?.courier_available) {
      return [];
    }
    const hasLocation = me.lat !== null && me.lng !== null;
    const result = await this.pool.query<JobRow>(
      `${JOB_SELECT(hasLocation ? pointSql(2, 3) : null)} WHERE d.status = 'OFFERED' AND d.service_zone_id = $1 ORDER BY d.created_at LIMIT 50`,
      hasLocation ? [courier.serviceZoneId, me.lng, me.lat] : [courier.serviceZoneId],
    );
    return result.rows.map((row) => toJob(row, false));
  }

  async myJobs(courier: ActingPartner): Promise<CourierJob[]> {
    const result = await this.pool.query<JobRow>(
      `${JOB_SELECT(null)} WHERE d.courier_id = $1 AND d.status IN ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT') ORDER BY d.assigned_at`,
      [courier.partnerId],
    );
    return result.rows.map((row) => toJob(row, true));
  }

  /** First courier wins: the conditional UPDATE makes concurrent accepts safe. */
  async accept(courier: ActingPartner, deliveryId: string): Promise<CourierJob> {
    const order = await withTransaction(this.pool, async (client) => {
      const taken = await client.query<{ order_id: string }>(
        `UPDATE deliveries SET status = 'ASSIGNED', courier_id = $2, assigned_at = now()
          WHERE id = $1 AND status = 'OFFERED' AND service_zone_id = $3 RETURNING order_id`,
        [deliveryId, courier.partnerId, courier.serviceZoneId],
      );
      const orderId = taken.rows[0]?.order_id;
      if (!orderId) {
        throw new ConflictException('This job is no longer available.');
      }
      return transitionOrder(client, await lockOrder(client, orderId), 'COURIER_ASSIGNED', 'SYSTEM', null, `Courier ${courier.displayName}`);
    });
    await this.notifications.safely(async () => {
      await this.notifications.notifyUser(order.customerId, {
        type: 'COURIER_ASSIGNED',
        title: { it: 'Corriere assegnato', en: 'Courier assigned' },
        body: { it: `${courier.displayName} consegnerà l'ordine #${order.orderNumber}.`, en: `${courier.displayName} will deliver order #${order.orderNumber}.` },
        data: { orderId: order.id },
      });
      await this.notifications.notifyPartner(order.sellerId, {
        type: 'COURIER_ASSIGNED',
        title: { it: 'Corriere in arrivo', en: 'Courier on the way' },
        body: { it: `${courier.displayName} sta arrivando a ritirare l'ordine #${order.orderNumber}.`, en: `${courier.displayName} is coming to pick up order #${order.orderNumber}.` },
        data: { orderId: order.id },
      });
    });
    return this.job(courier, deliveryId);
  }

  async job(courier: ActingPartner, deliveryId: string): Promise<CourierJob> {
    const result = await this.pool.query<JobRow>(`${JOB_SELECT(null)} WHERE d.id = $1 AND d.courier_id = $2`, [deliveryId, courier.partnerId]);
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Delivery not found.');
    }
    return toJob(row, true);
  }

  /** The courier gives the job back before pickup: it is offered to other couriers again. */
  async release(courier: ActingPartner, deliveryId: string): Promise<void> {
    await this.advance(courier, deliveryId, 'OFFERED', 'READY_FOR_PICKUP');
  }

  async pickUp(courier: ActingPartner, deliveryId: string): Promise<CourierJob> {
    await this.advance(courier, deliveryId, 'PICKED_UP', 'PICKED_UP');
    return this.job(courier, deliveryId);
  }

  async startTransit(courier: ActingPartner, deliveryId: string): Promise<CourierJob> {
    const order = await this.advance(courier, deliveryId, 'IN_TRANSIT', 'IN_TRANSIT');
    await this.notifications.safely(() =>
      this.notifications.notifyUser(order.customerId, {
        type: 'DELIVERY_IN_TRANSIT',
        title: { it: 'In consegna', en: 'On the way' },
        body: { it: `L'ordine #${order.orderNumber} è in viaggio.`, en: `Order #${order.orderNumber} is on its way.` },
        data: { orderId: order.id },
      }),
    );
    return this.job(courier, deliveryId);
  }

  /** GPS points are accepted only from the assigned courier, only while the delivery is active. */
  async recordLocations(courier: ActingPartner, deliveryId: string, points: readonly LocationUpdate[]): Promise<{ etaAt: string | null }> {
    const now = Date.now();
    for (const point of points) {
      const at = Date.parse(point.recordedAt);
      if (at > now + 2 * 60_000 || at < now - 24 * 3_600_000) {
        throw new BadRequestException('recordedAt must be within the last 24 hours.');
      }
    }
    const latest = [...points].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0] as LocationUpdate;
    return withTransaction(this.pool, async (client) => {
      const found = await client.query<{ status: DeliveryStatus }>(
        'SELECT status FROM deliveries WHERE id = $1 AND courier_id = $2 FOR UPDATE',
        [deliveryId, courier.partnerId],
      );
      const status = found.rows[0]?.status;
      if (!status) {
        throw new NotFoundException('Delivery not found.');
      }
      if (!TRACKABLE_DELIVERY_STATUSES.includes(status)) {
        throw new ConflictException('Location sharing is only accepted during an active delivery.');
      }
      for (const point of points) {
        await client.query(
          `INSERT INTO delivery_locations (delivery_id, location, accuracy_m, recorded_at) VALUES ($1, ${pointSql(2, 3)}, $4, $5)`,
          [deliveryId, point.longitude, point.latitude, point.accuracyMeters ?? null, point.recordedAt],
        );
      }
      const updated = await client.query<{ eta_at: Date | null }>(
        `UPDATE deliveries SET last_location = ${pointSql(2, 3)}, last_location_at = $4,
           eta_at = CASE WHEN status = 'IN_TRANSIT'
             THEN now() + make_interval(secs => ST_Distance(${pointSql(2, 3)}, dropoff_location) / ($5::float8 * 1000 / 3600))
             ELSE eta_at END
         WHERE id = $1 AND (last_location_at IS NULL OR last_location_at <= $4) RETURNING eta_at`,
        [deliveryId, latest.longitude, latest.latitude, latest.recordedAt, ETA_SPEED_KMH],
      );
      await client.query('UPDATE partner_accounts SET courier_last_seen_at = now() WHERE id = $1', [courier.partnerId]);
      return { etaAt: updated.rows[0]?.eta_at?.toISOString() ?? null };
    });
  }

  async arrive(courier: ActingPartner, deliveryId: string): Promise<CourierJob> {
    const result = await this.pool.query<{ order_id: string }>(
      `UPDATE deliveries SET arrived_at = COALESCE(arrived_at, now()) WHERE id = $1 AND courier_id = $2 AND status = 'IN_TRANSIT' RETURNING order_id`,
      [deliveryId, courier.partnerId],
    );
    const orderId = result.rows[0]?.order_id;
    if (!orderId) {
      throw new ConflictException('You can only mark arrival while the delivery is in transit.');
    }
    const order = await this.pool.query<{ customer_id: string; order_number: string }>('SELECT customer_id, order_number FROM orders WHERE id = $1', [orderId]);
    const row = order.rows[0];
    if (row) {
      await this.notifications.safely(() =>
        this.notifications.notifyUser(row.customer_id, {
          type: 'COURIER_ARRIVING',
          title: { it: 'Il corriere è arrivato', en: 'Courier arriving' },
          body: { it: `Il corriere è arrivato con l'ordine #${row.order_number}.`, en: `Your courier has arrived with order #${row.order_number}.` },
          data: { orderId },
        }),
      );
    }
    return this.job(courier, deliveryId);
  }

  /** Stores the proof photo (JPEG/PNG/WebP, checked by content) for a delivery in transit. */
  async uploadProof(courier: ActingPartner, deliveryId: string, bytes: unknown, meta: { latitude?: number; longitude?: number }): Promise<{ proofId: string }> {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new BadRequestException('Send the photo as the request body (Content-Type image/jpeg, image/png or image/webp).');
    }
    if (bytes.length > MAX_PROOF_BYTES) {
      throw new BadRequestException('Photo too large (max 8 MB).');
    }
    const type = detectImageType(bytes);
    if (!type) {
      throw new BadRequestException('The proof must be a JPEG, PNG or WebP image.');
    }
    const found = await this.pool.query<{ status: DeliveryStatus; proof_object_key: string | null }>(
      'SELECT status, proof_object_key FROM deliveries WHERE id = $1 AND courier_id = $2',
      [deliveryId, courier.partnerId],
    );
    const delivery = found.rows[0];
    if (!delivery) {
      throw new NotFoundException('Delivery not found.');
    }
    if (delivery.status !== 'IN_TRANSIT') {
      throw new ConflictException('Proof can only be captured while the delivery is in transit.');
    }
    const extension = type.split('/')[1] as string;
    const proofId = randomUUID();
    const key = `delivery-proofs/${deliveryId}/${proofId}.${extension}`;
    await this.storage.put(key, bytes, type);
    await this.pool.query(
      `UPDATE deliveries SET proof_object_key = $2, proof_captured_at = now(), proof_metadata = $3 WHERE id = $1 AND status = 'IN_TRANSIT'`,
      [
        deliveryId,
        key,
        JSON.stringify({
          contentType: type,
          sizeBytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          ...(meta.latitude !== undefined && meta.longitude !== undefined ? { latitude: meta.latitude, longitude: meta.longitude } : {}),
        }),
      ],
    );
    return { proofId };
  }

  /** Completes the delivery (proof required), marks the order delivered and records everyone's earnings. */
  async complete(courier: ActingPartner, deliveryId: string): Promise<CourierJob> {
    const order = await withTransaction(this.pool, async (client) => {
      const found = await client.query<{ status: DeliveryStatus; order_id: string; proof_object_key: string | null }>(
        'SELECT status, order_id, proof_object_key FROM deliveries WHERE id = $1 AND courier_id = $2 FOR UPDATE',
        [deliveryId, courier.partnerId],
      );
      const delivery = found.rows[0];
      if (!delivery) {
        throw new NotFoundException('Delivery not found.');
      }
      assertDeliveryTransition(delivery.status, 'DELIVERED', 'COURIER');
      if (!delivery.proof_object_key) {
        throw new ConflictException('Capture the delivery proof photo before completing.');
      }
      await client.query(`UPDATE deliveries SET status = 'DELIVERED', delivered_at = now() WHERE id = $1`, [deliveryId]);
      const delivered = await transitionOrder(client, await lockOrder(client, delivery.order_id), 'DELIVERED', 'SYSTEM', null, `Delivered by ${courier.displayName}`);
      await this.ledger.recordDeliveredOrder(client, delivery.order_id);
      return delivered;
    });
    await this.notifications.safely(async () => {
      await this.notifications.notifyUser(order.customerId, {
        type: 'ORDER_DELIVERED',
        title: { it: 'Consegnato', en: 'Delivered' },
        body: { it: `L'ordine #${order.orderNumber} è stato consegnato. Grazie!`, en: `Order #${order.orderNumber} has been delivered. Thank you!` },
        data: { orderId: order.id },
      });
      await this.notifications.notifyPartner(order.sellerId, {
        type: 'ORDER_DELIVERED',
        title: { it: 'Consegnato', en: 'Delivered' },
        body: { it: `L'ordine #${order.orderNumber} è stato consegnato.`, en: `Order #${order.orderNumber} was delivered.` },
        data: { orderId: order.id },
      });
    });
    return this.job(courier, deliveryId);
  }

  async proofImage(deliveryId: string): Promise<{ bytes: Buffer; contentType: string }> {
    const found = await this.pool.query<{ proof_object_key: string | null; proof_metadata: { contentType?: string } | null }>(
      'SELECT proof_object_key, proof_metadata FROM deliveries WHERE id = $1',
      [deliveryId],
    );
    const row = found.rows[0];
    if (!row?.proof_object_key) {
      throw new NotFoundException('No proof for this delivery.');
    }
    return { bytes: await this.storage.get(row.proof_object_key), contentType: row.proof_metadata?.contentType ?? 'application/octet-stream' };
  }

  /** Delivery status + matching order status change, both validated by their state machines. */
  private async advance(
    courier: ActingPartner,
    deliveryId: string,
    to: DeliveryStatus,
    orderTo: 'READY_FOR_PICKUP' | 'PICKED_UP' | 'IN_TRANSIT',
  ): Promise<LockedOrder> {
    return withTransaction(this.pool, async (client) => {
      const found = await client.query<{ status: DeliveryStatus; order_id: string }>(
        'SELECT status, order_id FROM deliveries WHERE id = $1 AND courier_id = $2 FOR UPDATE',
        [deliveryId, courier.partnerId],
      );
      const delivery = found.rows[0];
      if (!delivery) {
        throw new NotFoundException('Delivery not found.');
      }
      assertDeliveryTransition(delivery.status, to, 'COURIER');
      await client.query(
        `UPDATE deliveries SET status = $2,
           courier_id = CASE WHEN $2 = 'OFFERED' THEN NULL ELSE courier_id END,
           assigned_at = CASE WHEN $2 = 'OFFERED' THEN NULL ELSE assigned_at END,
           picked_up_at = CASE WHEN $2 = 'PICKED_UP' THEN now() ELSE picked_up_at END,
           in_transit_at = CASE WHEN $2 = 'IN_TRANSIT' THEN now() ELSE in_transit_at END
         WHERE id = $1`,
        [deliveryId, to],
      );
      return transitionOrder(client, await lockOrder(client, delivery.order_id), orderTo, 'SYSTEM', null, `Courier ${courier.displayName}`);
    });
  }
}

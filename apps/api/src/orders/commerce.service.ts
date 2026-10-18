import type { Cart, CartItemRequest, CheckoutRequest, CheckoutResponse, OrderDetail, OrderSummary } from '@flower-man/contracts';
import { calculateOrderAmounts, type OrderStatus } from '@flower-man/domain';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import pg from 'pg';

import type { AuthenticatedContext } from '../auth/auth.guard.js';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { pointSql } from '../common/geo.js';
import { PG_POOL } from '../database/database.module.js';
import { withTransaction } from '../database/transaction.js';
import { DeliveryService } from '../delivery/delivery.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { ActingPartner } from '../partners/partners.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { ZonesService } from '../zones/zones.service.js';
import { listOrders, loadOrderDetail, toOrderSummary, ORDER_SUMMARY_SELECT } from './order-views.js';
import { lockOrder, releaseStock, transitionOrder } from './order-workflow.js';

const MIN_LEAD_MINUTES = 60;
const MAX_ADVANCE_DAYS = 30;

export function validateRequestedDelivery(iso: string | undefined): Date | null {
  if (!iso) {
    return null;
  }
  const at = new Date(iso);
  const earliest = Date.now() + MIN_LEAD_MINUTES * 60_000;
  const latest = Date.now() + MAX_ADVANCE_DAYS * 24 * 3_600_000;
  if (at.getTime() < earliest - 60_000 || at.getTime() > latest) {
    throw new BadRequestException(`Requested delivery time must be between ${MIN_LEAD_MINUTES} minutes and ${MAX_ADVANCE_DAYS} days from now.`);
  }
  return at;
}

export function requireVerifiedEmail(auth: AuthenticatedContext): void {
  if (!auth.user.emailVerified) {
    throw new ForbiddenException('Please verify your email address before placing an order.');
  }
}

/** Server-backed cart, authoritative checkout, and the customer/seller order workflows. */
@Injectable()
export class CommerceService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly zones: ZonesService,
    private readonly payments: PaymentsService,
    private readonly delivery: DeliveryService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- cart
  async getCart(customerId: string): Promise<Cart> {
    const cart = await this.pool.query<{ seller_id: string | null }>('SELECT seller_id FROM carts WHERE customer_id = $1', [customerId]);
    const items = await this.pool.query<{ product_id: string; name: string; quantity: number; unit_price_minor: number; available: boolean }>(
      `SELECT ci.product_id, pr.name, ci.quantity, pr.price_minor AS unit_price_minor,
              (pr.available AND pr.archived_at IS NULL AND (pr.stock IS NULL OR pr.stock >= ci.quantity)
               AND p.verification_status = 'APPROVED') AS available
         FROM cart_items ci JOIN products pr ON pr.id = ci.product_id JOIN partner_accounts p ON p.id = pr.seller_id
        WHERE ci.customer_id = $1 ORDER BY pr.name`,
      [customerId],
    );
    const lines = items.rows.map((row) => ({
      productId: row.product_id,
      name: row.name,
      quantity: row.quantity,
      unitPriceMinor: row.unit_price_minor,
      lineTotalMinor: row.unit_price_minor * row.quantity,
      available: row.available,
    }));
    return {
      sellerId: lines.length > 0 ? (cart.rows[0]?.seller_id ?? null) : null,
      items: lines,
      subtotalMinor: lines.reduce((sum, line) => sum + line.lineTotalMinor, 0),
    };
  }

  async setItem(customerId: string, input: CartItemRequest): Promise<Cart> {
    await withTransaction(this.pool, async (client) => {
      const product = await client.query<{ seller_id: string; price_minor: number; stock: number | null }>(
        `SELECT pr.seller_id, pr.price_minor, pr.stock FROM products pr JOIN partner_accounts p ON p.id = pr.seller_id
          WHERE pr.id = $1 AND pr.available AND pr.archived_at IS NULL AND p.verification_status = 'APPROVED'`,
        [input.productId],
      );
      const row = product.rows[0];
      if (!row) {
        throw new NotFoundException('This product is not available.');
      }
      if (row.stock !== null && row.stock < input.quantity) {
        throw new ConflictException(`Only ${row.stock} left in stock.`);
      }
      await client.query(
        `INSERT INTO carts (customer_id, seller_id) VALUES ($1, $2) ON CONFLICT (customer_id) DO NOTHING`,
        [customerId, row.seller_id],
      );
      const cart = await client.query<{ seller_id: string | null; items: string }>(
        `SELECT c.seller_id, (SELECT count(*) FROM cart_items ci WHERE ci.customer_id = c.customer_id) AS items
           FROM carts c WHERE c.customer_id = $1 FOR UPDATE`,
        [customerId],
      );
      const current = cart.rows[0];
      if (current && Number(current.items) > 0 && current.seller_id !== row.seller_id) {
        throw new ConflictException('Your cart has flowers from another seller. Check out or empty it first.');
      }
      await client.query('UPDATE carts SET seller_id = $2, updated_at = now() WHERE customer_id = $1', [customerId, row.seller_id]);
      await client.query(
        `INSERT INTO cart_items (customer_id, product_id, quantity, unit_price_minor) VALUES ($1, $2, $3, $4)
         ON CONFLICT (customer_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity, unit_price_minor = EXCLUDED.unit_price_minor`,
        [customerId, input.productId, input.quantity, row.price_minor],
      );
    });
    return this.getCart(customerId);
  }

  async removeItem(customerId: string, productId: string): Promise<Cart> {
    await this.pool.query('DELETE FROM cart_items WHERE customer_id = $1 AND product_id = $2', [customerId, productId]);
    return this.getCart(customerId);
  }

  async clearCart(customerId: string): Promise<void> {
    await this.pool.query('DELETE FROM cart_items WHERE customer_id = $1', [customerId]);
  }

  // ---------------------------------------------------------------- checkout
  /**
   * Creates the order from the server cart. Prices, fees and totals are recomputed from the database:
   * nothing the client sends about money is trusted.
   */
  async checkout(auth: AuthenticatedContext, input: CheckoutRequest): Promise<CheckoutResponse> {
    requireVerifiedEmail(auth);
    const requestedAt = validateRequestedDelivery(input.requestedDeliveryAt);
    const { latitude, longitude } = input.deliveryLocation;

    const orderId = await withTransaction(this.pool, async (client) => {
      const zone = await this.zones.requireActiveZone(latitude, longitude, client);
      const lines = await client.query<{
        product_id: string;
        name: string;
        quantity: number;
        price_minor: number;
        stock: number | null;
        sellable: boolean;
        seller_id: string;
        seller_zone: string | null;
        seller_approved: boolean;
      }>(
        `SELECT ci.product_id, pr.name, ci.quantity, pr.price_minor, pr.stock,
                (pr.available AND pr.archived_at IS NULL) AS sellable, pr.seller_id,
                p.service_zone_id AS seller_zone, p.verification_status = 'APPROVED' AS seller_approved
           FROM cart_items ci JOIN products pr ON pr.id = ci.product_id JOIN partner_accounts p ON p.id = pr.seller_id
          WHERE ci.customer_id = $1 ORDER BY ci.product_id FOR UPDATE OF pr`,
        [auth.userId],
      );
      if (lines.rows.length === 0) {
        throw new BadRequestException('Your cart is empty.');
      }
      const sellerIds = new Set(lines.rows.map((line) => line.seller_id));
      const first = lines.rows[0] as (typeof lines.rows)[number];
      if (sellerIds.size !== 1 || !first.seller_approved) {
        throw new ConflictException('This seller is not accepting orders right now.');
      }
      if (first.seller_zone !== zone.id) {
        throw new BadRequestException('This seller does not deliver to that address.');
      }
      for (const line of lines.rows) {
        if (!line.sellable) {
          throw new ConflictException(`"${line.name}" is no longer available. Remove it from your cart.`);
        }
        if (line.stock !== null && line.stock < line.quantity) {
          throw new ConflictException(`Only ${line.stock} of "${line.name}" left.`);
        }
      }
      const amounts = calculateOrderAmounts(
        lines.rows.map((line) => ({ unitPrice: line.price_minor, quantity: line.quantity })),
        zone.deliveryFeeMinor,
        this.config.commerce.commissionBasisPoints,
      );
      if (input.expectedTotalMinor !== undefined && input.expectedTotalMinor !== amounts.total) {
        throw new ConflictException(`Prices changed: the total is now €${(amounts.total / 100).toFixed(2)}. Please review your cart.`);
      }

      const order = await client.query<{ id: string }>(
        `INSERT INTO orders (customer_id, seller_id, source, subtotal_minor, delivery_fee_minor, total_minor, platform_commission_minor,
                             recipient_name, recipient_phone, delivery_address, delivery_location, service_zone_id,
                             delivery_notes, gift_message, requested_delivery_at)
         VALUES ($1, $2, 'CATALOG', $3, $4, $5, $6, $7, $8, $9, ${pointSql(10, 11)}, $12, $13, $14, $15) RETURNING id`,
        [
          auth.userId, first.seller_id, amounts.subtotal, amounts.deliveryFee, amounts.total, amounts.platformCommission,
          input.recipientName, input.recipientPhone, input.deliveryAddress, longitude, latitude, zone.id,
          input.deliveryNotes ?? null, input.giftMessage ?? null, requestedAt,
        ],
      );
      const id = order.rows[0]?.id as string;
      for (const line of lines.rows) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, name, unit_price_minor, quantity, line_total_minor) VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, line.product_id, line.name, line.price_minor, line.quantity, line.price_minor * line.quantity],
        );
        if (line.stock !== null) {
          await client.query('UPDATE products SET stock = stock - $2, updated_at = now() WHERE id = $1', [line.product_id, line.quantity]);
        }
      }
      await client.query(
        `INSERT INTO order_status_history (order_id, from_status, to_status, actor, actor_user_id) VALUES ($1, NULL, 'PENDING_PAYMENT', 'CUSTOMER', $2)`,
        [id, auth.userId],
      );
      await client.query('DELETE FROM cart_items WHERE customer_id = $1', [auth.userId]);
      return id;
    });

    const payment = await this.payments.instructionsFor(orderId);
    const summary = await this.pool.query(`${ORDER_SUMMARY_SELECT} WHERE o.id = $1`, [orderId]);
    return { order: toOrderSummary(summary.rows[0]), payment };
  }

  // ---------------------------------------------------------------- customer orders
  async customerOrders(customerId: string): Promise<OrderSummary[]> {
    return listOrders(this.pool, 'o.customer_id = $1', [customerId]);
  }

  async customerOrder(customerId: string, orderId: string): Promise<OrderDetail> {
    const detail = await loadOrderDetail(this.pool, orderId, 'o.customer_id = $2', customerId);
    if (!detail) {
      throw new NotFoundException('Order not found.');
    }
    return detail;
  }

  async customerPay(customerId: string, orderId: string) {
    await this.customerOrder(customerId, orderId);
    return this.payments.instructionsFor(orderId);
  }

  /** Customers may cancel before the florist confirms. Paid orders are refunded in full. */
  async customerCancel(customerId: string, orderId: string, reason: string): Promise<OrderDetail> {
    await this.cancel(orderId, 'CUSTOMER', customerId, reason, (order) => {
      if (order.customerId !== customerId) {
        throw new NotFoundException('Order not found.');
      }
    });
    return this.customerOrder(customerId, orderId);
  }

  // ---------------------------------------------------------------- seller orders
  async sellerOrders(seller: ActingPartner, status?: string): Promise<OrderSummary[]> {
    return listOrders(this.pool, `o.seller_id = $1 AND o.status <> 'PENDING_PAYMENT' AND ($2::text IS NULL OR o.status = $2)`, [seller.partnerId, status ?? null]);
  }

  async sellerOrder(seller: ActingPartner, orderId: string): Promise<OrderDetail> {
    const detail = await loadOrderDetail(this.pool, orderId, `o.seller_id = $2 AND o.status <> 'PENDING_PAYMENT'`, seller.partnerId);
    if (!detail) {
      throw new NotFoundException('Order not found.');
    }
    return detail;
  }

  /** accept → CONFIRMED, prepare → PREPARING, ready → READY_FOR_PICKUP (+ courier job). */
  async sellerAdvance(seller: ActingPartner, userId: string, orderId: string, to: Extract<OrderStatus, 'CONFIRMED' | 'PREPARING' | 'READY_FOR_PICKUP'>): Promise<OrderDetail> {
    const order = await withTransaction(this.pool, async (client) => {
      const locked = await lockOrder(client, orderId);
      // Unpaid orders are invisible to sellers.
      if (locked.sellerId !== seller.partnerId || locked.status === 'PENDING_PAYMENT') {
        throw new NotFoundException('Order not found.');
      }
      const updated = await transitionOrder(client, locked, to, 'SELLER', userId);
      if (to === 'READY_FOR_PICKUP') {
        await this.delivery.createJob(client, updated);
      }
      return updated;
    });
    const messages: Record<typeof to, { title: string; body: string }> = {
      CONFIRMED: { title: 'Order confirmed', body: `${seller.displayName} accepted order #${order.orderNumber}.` },
      PREPARING: { title: 'Being prepared', body: `Your flowers for order #${order.orderNumber} are being prepared.` },
      READY_FOR_PICKUP: { title: 'Ready', body: `Order #${order.orderNumber} is ready and waiting for a courier.` },
    };
    await this.notifications.safely(async () => {
      await this.notifications.notifyUser(order.customerId, { type: `ORDER_${to}`, ...messages[to], data: { orderId } });
      if (to === 'READY_FOR_PICKUP') {
        await this.delivery.notifyAvailableCouriers(order.serviceZoneId, order.orderNumber);
      }
    });
    return this.sellerOrder(seller, orderId);
  }

  async sellerReject(seller: ActingPartner, userId: string, orderId: string, reason: string): Promise<OrderDetail> {
    await this.cancel(orderId, 'SELLER', userId, reason, (order) => {
      if (order.sellerId !== seller.partnerId || order.status === 'PENDING_PAYMENT') {
        throw new NotFoundException('Order not found.');
      }
    });
    return this.sellerOrder(seller, orderId);
  }

  /** Shared cancellation: state machine check, stock release, delivery cancellation, then refund if paid. */
  async cancel(
    orderId: string,
    actor: 'CUSTOMER' | 'SELLER' | 'ADMIN' | 'SYSTEM',
    actorUserId: string | null,
    reason: string,
    authorize: (order: Awaited<ReturnType<typeof lockOrder>>) => void = () => undefined,
  ): Promise<void> {
    const { order, wasPaid } = await withTransaction(this.pool, async (client) => {
      const locked = await lockOrder(client, orderId);
      authorize(locked);
      const wasPaid = locked.status !== 'PENDING_PAYMENT';
      const cancelled = await transitionOrder(client, locked, 'CANCELLED', actor, actorUserId, reason);
      if (locked.source === 'CATALOG') {
        await releaseStock(client, orderId);
      }
      await client.query(`UPDATE deliveries SET status = 'CANCELLED', cancelled_at = now() WHERE order_id = $1 AND status IN ('OFFERED', 'ASSIGNED')`, [orderId]);
      return { order: cancelled, wasPaid };
    });
    if (wasPaid) {
      await this.payments.refund(orderId, null, `Order cancelled: ${reason}`, actor === 'ADMIN' ? actorUserId : null);
    }
    await this.notifications.safely(async () => {
      await this.notifications.notifyUser(order.customerId, {
        type: 'ORDER_CANCELLED',
        title: 'Order cancelled',
        body: `Order #${order.orderNumber} was cancelled.${wasPaid ? ' You will be refunded in full.' : ''}`,
        data: { orderId },
      });
      if (actor !== 'SELLER' && wasPaid) {
        await this.notifications.notifyPartner(order.sellerId, { type: 'ORDER_CANCELLED', title: 'Order cancelled', body: `Order #${order.orderNumber} was cancelled.`, data: { orderId } });
      }
    });
  }
}

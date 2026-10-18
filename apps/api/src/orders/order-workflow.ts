import { type Actor, assertOrderTransition, type OrderStatus } from '@flower-man/domain';
import { NotFoundException } from '@nestjs/common';
import type pg from 'pg';

export interface LockedOrder {
  readonly id: string;
  readonly orderNumber: number;
  readonly status: OrderStatus;
  readonly customerId: string;
  readonly sellerId: string;
  readonly source: 'CATALOG' | 'CUSTOM_REQUEST';
  readonly subtotalMinor: number;
  readonly totalMinor: number;
  readonly platformCommissionMinor: number;
  readonly deliveryFeeMinor: number;
  readonly serviceZoneId: string;
}

interface OrderLockRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  customer_id: string;
  seller_id: string;
  source: LockedOrder['source'];
  subtotal_minor: number;
  total_minor: number;
  platform_commission_minor: number;
  delivery_fee_minor: number;
  service_zone_id: string;
}

export async function lockOrder(client: pg.ClientBase, orderId: string): Promise<LockedOrder> {
  const result = await client.query<OrderLockRow>(
    `SELECT id, order_number, status, customer_id, seller_id, source, subtotal_minor, total_minor,
            platform_commission_minor, delivery_fee_minor, service_zone_id
       FROM orders WHERE id = $1 FOR UPDATE`,
    [orderId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new NotFoundException('Order not found.');
  }
  return {
    id: row.id,
    orderNumber: Number(row.order_number),
    status: row.status,
    customerId: row.customer_id,
    sellerId: row.seller_id,
    source: row.source,
    subtotalMinor: row.subtotal_minor,
    totalMinor: row.total_minor,
    platformCommissionMinor: row.platform_commission_minor,
    deliveryFeeMinor: row.delivery_fee_minor,
    serviceZoneId: row.service_zone_id,
  };
}

/**
 * The ONLY way an order changes status: checks the state machine (who may do what, from which state),
 * updates the order and appends to order_status_history in the caller's transaction.
 */
export async function transitionOrder(
  client: pg.ClientBase,
  order: LockedOrder,
  to: OrderStatus,
  actor: Actor,
  actorUserId: string | null,
  reason?: string,
): Promise<LockedOrder> {
  assertOrderTransition(order.status, to, actor);
  await client.query(
    `UPDATE orders SET status = $2, updated_at = now(),
       paid_at = CASE WHEN $2 = 'PAID' THEN now() ELSE paid_at END,
       delivered_at = CASE WHEN $2 = 'DELIVERED' THEN now() ELSE delivered_at END,
       cancelled_at = CASE WHEN $2 = 'CANCELLED' THEN now() ELSE cancelled_at END,
       cancel_reason = CASE WHEN $2 = 'CANCELLED' THEN $3 ELSE cancel_reason END
     WHERE id = $1`,
    [order.id, to, reason ?? null],
  );
  await client.query(
    'INSERT INTO order_status_history (order_id, from_status, to_status, actor, actor_user_id, reason) VALUES ($1, $2, $3, $4, $5, $6)',
    [order.id, order.status, to, actor, actorUserId, reason ?? null],
  );
  return { ...order, status: to };
}

/** Puts catalogue stock back when an order is cancelled before fulfilment. */
export async function releaseStock(client: pg.ClientBase, orderId: string): Promise<void> {
  await client.query(
    `UPDATE products p SET stock = p.stock + oi.quantity, updated_at = now()
       FROM order_items oi WHERE oi.order_id = $1 AND oi.product_id = p.id AND p.stock IS NOT NULL`,
    [orderId],
  );
}

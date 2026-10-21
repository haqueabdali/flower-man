import { type DeliveryTracking, type OrderDetail, type OrderSummary, REVIEW_WINDOW_DAYS } from '@flower-man/contracts';
import type { DeliveryStatus, OrderStatus } from '@flower-man/domain';
import type pg from 'pg';

import { selectPoint, toGeoPoint } from '../common/geo.js';

interface OrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  source: OrderSummary['source'];
  seller_id: string;
  seller_name: string;
  subtotal_minor: number;
  delivery_fee_minor: number;
  discount_minor: number;
  tip_minor: number;
  total_minor: number;
  recipient_name: string;
  delivery_address: string;
  requested_delivery_at: Date | null;
  created_at: Date;
}

export const ORDER_SUMMARY_SELECT = `
  SELECT o.id, o.order_number, o.status, o.source, o.seller_id, p.display_name AS seller_name, o.subtotal_minor,
         o.delivery_fee_minor, o.discount_minor, o.tip_minor, o.total_minor, o.recipient_name, o.delivery_address, o.requested_delivery_at, o.created_at
    FROM orders o JOIN partner_accounts p ON p.id = o.seller_id`;

export const toOrderSummary = (row: OrderRow): OrderSummary => ({
  id: row.id,
  orderNumber: Number(row.order_number),
  status: row.status,
  source: row.source,
  sellerId: row.seller_id,
  sellerName: row.seller_name,
  subtotalMinor: row.subtotal_minor,
  deliveryFeeMinor: row.delivery_fee_minor,
  discountMinor: row.discount_minor,
  tipMinor: row.tip_minor,
  totalMinor: row.total_minor,
  currency: 'EUR',
  recipientName: row.recipient_name,
  deliveryAddress: row.delivery_address,
  requestedDeliveryAt: row.requested_delivery_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
});

export async function listOrders(db: pg.Pool, where: string, params: unknown[]): Promise<OrderSummary[]> {
  const result = await db.query<OrderRow>(`${ORDER_SUMMARY_SELECT} WHERE ${where} ORDER BY o.created_at DESC LIMIT 200`, params);
  return result.rows.map(toOrderSummary);
}

export async function loadDeliveryTracking(db: pg.Pool | pg.ClientBase, orderId: string): Promise<DeliveryTracking | null> {
  const result = await db.query<{
    id: string;
    status: DeliveryStatus;
    courier_name: string | null;
    last_lat: number | null;
    last_lng: number | null;
    last_location_at: Date | null;
    eta_at: Date | null;
    arrived_at: Date | null;
    delivered_at: Date | null;
  }>(
    `SELECT d.id, d.status, c.display_name AS courier_name, ${selectPoint('d.last_location', 'last')},
            d.last_location_at, d.eta_at, d.arrived_at, d.delivered_at
       FROM deliveries d LEFT JOIN partner_accounts c ON c.id = d.courier_id WHERE d.order_id = $1`,
    [orderId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    status: row.status,
    courierName: row.courier_name,
    lastLocation: toGeoPoint(row.last_lat, row.last_lng),
    lastLocationAt: row.last_location_at?.toISOString() ?? null,
    etaAt: row.eta_at?.toISOString() ?? null,
    arrivedAt: row.arrived_at?.toISOString() ?? null,
    deliveredAt: row.delivered_at?.toISOString() ?? null,
  };
}

/** Full order view. Caller is responsible for authorization (the WHERE clause in `scope`). */
export async function loadOrderDetail(db: pg.Pool, orderId: string, scope: string, scopeParam: string | null): Promise<OrderDetail | null> {
  const result = await db.query<OrderRow & { recipient_phone: string; delivery_notes: string | null; gift_message: string | null; payment_status: string | null; can_review: boolean; review_seller_rating: number | null; review_courier_rating: number | null; review_comment: string | null; review_created_at: Date | null }>(
    `SELECT o.id, o.order_number, o.status, o.source, o.seller_id, p.display_name AS seller_name, o.subtotal_minor,
            o.delivery_fee_minor, o.discount_minor, o.tip_minor, o.total_minor, o.recipient_name, o.delivery_address, o.requested_delivery_at, o.created_at,
            o.recipient_phone, o.delivery_notes, o.gift_message, pay.status AS payment_status,
            r.seller_rating AS review_seller_rating, r.courier_rating AS review_courier_rating, r.comment AS review_comment,
            r.created_at AS review_created_at,
            (o.status = 'DELIVERED' AND r.order_id IS NULL AND EXISTS (
              SELECT 1 FROM deliveries d WHERE d.order_id = o.id AND d.status = 'DELIVERED'
                 AND d.delivered_at > now() - make_interval(days => ${REVIEW_WINDOW_DAYS}))) AS can_review
       FROM orders o JOIN partner_accounts p ON p.id = o.seller_id LEFT JOIN payments pay ON pay.order_id = o.id
       LEFT JOIN order_reviews r ON r.order_id = o.id
      WHERE o.id = $1 AND (${scope})`,
    scopeParam === null ? [orderId] : [orderId, scopeParam],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  const items = await db.query<{ name: string; quantity: number; unit_price_minor: number; line_total_minor: number }>(
    'SELECT name, quantity, unit_price_minor, line_total_minor FROM order_items WHERE order_id = $1 ORDER BY name',
    [orderId],
  );
  const history = await db.query<{ from_status: OrderStatus | null; to_status: OrderStatus; actor: string; occurred_at: Date; reason: string | null }>(
    'SELECT from_status, to_status, actor, occurred_at, reason FROM order_status_history WHERE order_id = $1 ORDER BY id',
    [orderId],
  );
  return {
    ...toOrderSummary(row),
    recipientPhone: row.recipient_phone,
    deliveryNotes: row.delivery_notes,
    giftMessage: row.gift_message,
    items: items.rows.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPriceMinor: item.unit_price_minor,
      lineTotalMinor: item.line_total_minor,
    })),
    history: history.rows.map((entry) => ({
      from: entry.from_status,
      to: entry.to_status,
      actor: entry.actor,
      at: entry.occurred_at.toISOString(),
      reason: entry.reason,
    })),
    delivery: await loadDeliveryTracking(db, orderId),
    paymentStatus: row.payment_status,
    review: row.review_created_at
      ? { sellerRating: row.review_seller_rating ?? 0, courierRating: row.review_courier_rating, comment: row.review_comment, createdAt: row.review_created_at.toISOString() }
      : null,
    canReview: row.can_review,
  };
}

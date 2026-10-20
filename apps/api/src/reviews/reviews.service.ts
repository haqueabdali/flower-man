import { type AdminReview, type PublicReview, type Rating, REVIEW_WINDOW_DAYS, type ReviewOrderRequest } from '@flower-man/contracts';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';

import { recordAudit } from '../common/audit.js';
import { toRating } from '../common/rating.js';
import { PG_POOL } from '../database/database.module.js';
import { withTransaction } from '../database/transaction.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const STARS = (rating: number) => '★'.repeat(rating) + '☆'.repeat(5 - rating);

/** One review per delivered order, by its customer (ADR-019). Partner totals change in the same transaction. */
@Injectable()
export class ReviewsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly notifications: NotificationsService,
  ) {}

  async review(customerId: string, orderId: string, input: ReviewOrderRequest): Promise<void> {
    const review = await withTransaction(this.pool, async (client) => {
      const found = await client.query<{ seller_id: string; order_number: number; status: string; courier_id: string | null; delivered_at: Date | null }>(
        `SELECT o.seller_id, o.order_number, o.status, d.courier_id, d.delivered_at
           FROM orders o LEFT JOIN deliveries d ON d.order_id = o.id AND d.status = 'DELIVERED'
          WHERE o.id = $1 AND o.customer_id = $2
          FOR UPDATE OF o`,
        [orderId, customerId],
      );
      const order = found.rows[0];
      if (!order) {
        throw new NotFoundException('Order not found.');
      }
      if (order.status !== 'DELIVERED' || !order.delivered_at) {
        throw new ConflictException('You can review an order once it has been delivered.');
      }
      if (order.delivered_at.getTime() < Date.now() - REVIEW_WINDOW_DAYS * 86_400_000) {
        throw new ConflictException(`Reviews are possible for ${REVIEW_WINDOW_DAYS} days after delivery.`);
      }
      if (input.courierRating !== undefined && !order.courier_id) {
        throw new BadRequestException('This order had no courier to rate.');
      }
      const inserted = await client.query(
        `INSERT INTO order_reviews (order_id, customer_id, seller_id, seller_rating, courier_id, courier_rating, comment)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (order_id) DO NOTHING`,
        [orderId, customerId, order.seller_id, input.sellerRating, order.courier_id, input.courierRating ?? null, input.comment ?? null],
      );
      if (inserted.rowCount !== 1) {
        throw new ConflictException('This order has already been reviewed.');
      }
      await client.query('UPDATE partner_accounts SET rating_sum = rating_sum + $2, rating_count = rating_count + 1 WHERE id = $1', [order.seller_id, input.sellerRating]);
      if (input.courierRating !== undefined && order.courier_id) {
        await client.query('UPDATE partner_accounts SET rating_sum = rating_sum + $2, rating_count = rating_count + 1 WHERE id = $1', [order.courier_id, input.courierRating]);
      }
      return order;
    });
    await this.notifications.safely(() =>
      this.notifications.notifyPartner(review.seller_id, {
        type: 'REVIEW_RECEIVED',
        title: { it: 'Nuova recensione', en: 'New review' },
        body: {
          it: `Ordine #${review.order_number}: ${STARS(input.sellerRating)}${input.comment ? ` “${input.comment.slice(0, 80)}”` : ''}`,
          en: `Order #${review.order_number}: ${STARS(input.sellerRating)}${input.comment ? ` “${input.comment.slice(0, 80)}”` : ''}`,
        },
        data: { orderId },
      }),
    );
  }

  /** Rating and visible reviews of an approved florist, newest first, without any customer data. */
  async forSeller(sellerId: string): Promise<{ rating: Rating | null; items: PublicReview[] }> {
    const seller = await this.pool.query<{ rating_sum: number; rating_count: number }>(
      `SELECT rating_sum, rating_count FROM partner_accounts WHERE id = $1 AND verification_status = 'APPROVED' AND kind IN ('SHOP', 'FREELANCE_SELLER')`,
      [sellerId],
    );
    const totals = seller.rows[0];
    if (!totals) {
      throw new NotFoundException('Seller not found.');
    }
    const result = await this.pool.query<{ seller_rating: number; comment: string | null; created_at: Date }>(
      `SELECT seller_rating, comment, created_at FROM order_reviews WHERE seller_id = $1 AND hidden_at IS NULL ORDER BY created_at DESC LIMIT 50`,
      [sellerId],
    );
    return {
      rating: toRating(totals.rating_sum, totals.rating_count),
      items: result.rows.map((row) => ({ rating: row.seller_rating, comment: row.comment, createdAt: row.created_at.toISOString() })),
    };
  }

  async listForAdmin(): Promise<AdminReview[]> {
    const result = await this.pool.query<{
      order_id: string; order_number: number; seller_name: string; courier_name: string | null; customer_email: string;
      seller_rating: number; courier_rating: number | null; comment: string | null; created_at: Date; hidden_at: Date | null;
    }>(
      `SELECT r.order_id, o.order_number, s.display_name AS seller_name, c.display_name AS courier_name, u.email AS customer_email,
              r.seller_rating, r.courier_rating, r.comment, r.created_at, r.hidden_at
         FROM order_reviews r JOIN orders o ON o.id = r.order_id JOIN partner_accounts s ON s.id = r.seller_id
         JOIN users u ON u.id = r.customer_id LEFT JOIN partner_accounts c ON c.id = r.courier_id
        ORDER BY r.created_at DESC LIMIT 200`,
    );
    return result.rows.map((row) => ({
      orderId: row.order_id,
      orderNumber: row.order_number,
      sellerName: row.seller_name,
      courierName: row.courier_name,
      customerEmail: row.customer_email,
      sellerRating: row.seller_rating,
      courierRating: row.courier_rating,
      comment: row.comment,
      createdAt: row.created_at.toISOString(),
      hiddenAt: row.hidden_at?.toISOString() ?? null,
    }));
  }

  /** Moderation: hides an abusive review and removes it from the partner totals. Idempotent. */
  async hide(adminId: string, orderId: string, reason: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      const hidden = await client.query<{ seller_id: string; seller_rating: number; courier_id: string | null; courier_rating: number | null }>(
        `UPDATE order_reviews SET hidden_at = now(), hidden_by = $2 WHERE order_id = $1 AND hidden_at IS NULL
         RETURNING seller_id, seller_rating, courier_id, courier_rating`,
        [orderId, adminId],
      );
      const row = hidden.rows[0];
      if (!row) {
        const exists = await client.query('SELECT 1 FROM order_reviews WHERE order_id = $1', [orderId]);
        if (exists.rowCount !== 1) throw new NotFoundException('Review not found.');
        return;
      }
      await client.query('UPDATE partner_accounts SET rating_sum = rating_sum - $2, rating_count = rating_count - 1 WHERE id = $1', [row.seller_id, row.seller_rating]);
      if (row.courier_id && row.courier_rating !== null) {
        await client.query('UPDATE partner_accounts SET rating_sum = rating_sum - $2, rating_count = rating_count - 1 WHERE id = $1', [row.courier_id, row.courier_rating]);
      }
      await recordAudit(client, adminId, 'REVIEW_HIDDEN', 'order_review', orderId, { reason });
    });
  }
}

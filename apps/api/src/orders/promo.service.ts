import type { CreatePromoRequest, PromoCodeView } from '@flower-man/contracts';
import { discountFor, type OrderAmounts } from '@flower-man/domain';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';

import { recordAudit } from '../common/audit.js';
import { PG_POOL } from '../database/database.module.js';

interface PromoRow {
  id: string;
  code: string;
  description: string | null;
  kind: 'PERCENT' | 'FIXED';
  value: number;
  max_discount_minor: number | null;
  min_subtotal_minor: number;
  starts_at: Date;
  ends_at: Date | null;
  max_redemptions: number | null;
  first_order_only: boolean;
  active: boolean;
}

export interface AppliedPromo {
  readonly promoId: string;
  readonly code: string;
  readonly description: string | null;
  readonly discountMinor: number;
}

/** Discount codes (ADR-022). Checkout calls evaluate() with lock=true inside its transaction, then record(). */
@Injectable()
export class PromoService {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async evaluate(db: pg.ClientBase | pg.Pool, customerId: string, code: string, amounts: OrderAmounts, lock: boolean): Promise<AppliedPromo> {
    const found = await db.query<PromoRow>(`SELECT * FROM promo_codes WHERE code = $1 ${lock ? 'FOR UPDATE' : ''}`, [code]);
    const promo = found.rows[0];
    const now = Date.now();
    if (!promo || !promo.active || promo.starts_at.getTime() > now || (promo.ends_at && promo.ends_at.getTime() <= now)) {
      throw new BadRequestException('This code is not valid.');
    }
    const usage = await db.query<{ total: string; mine: string; previous_orders: string }>(
      `SELECT (SELECT count(*) FROM promo_redemptions WHERE promo_code_id = $1 AND released_at IS NULL) AS total,
              (SELECT count(*) FROM promo_redemptions WHERE promo_code_id = $1 AND customer_id = $2 AND released_at IS NULL) AS mine,
              (SELECT count(*) FROM orders WHERE customer_id = $2 AND status NOT IN ('PENDING_PAYMENT', 'CANCELLED')) AS previous_orders`,
      [promo.id, customerId],
    );
    const counts = usage.rows[0];
    if (Number(counts?.mine ?? 0) > 0) {
      throw new ConflictException('You have already used this code.');
    }
    if (promo.max_redemptions !== null && Number(counts?.total ?? 0) >= promo.max_redemptions) {
      throw new ConflictException('This code has reached its limit.');
    }
    if (promo.first_order_only && Number(counts?.previous_orders ?? 0) > 0) {
      throw new ConflictException('This code is for first orders only.');
    }
    if (amounts.subtotal < promo.min_subtotal_minor) {
      throw new BadRequestException(`This code needs a minimum order of €${(promo.min_subtotal_minor / 100).toFixed(2)}.`);
    }
    const discountMinor = discountFor(amounts, { kind: promo.kind, value: promo.value, maxDiscountMinor: promo.max_discount_minor });
    if (discountMinor <= 0) {
      throw new BadRequestException('This code gives no discount on this order.');
    }
    return { promoId: promo.id, code: promo.code, description: promo.description, discountMinor };
  }

  async record(client: pg.ClientBase, orderId: string, customerId: string, applied: AppliedPromo): Promise<void> {
    await client.query('INSERT INTO promo_redemptions (order_id, promo_code_id, customer_id, discount_minor) VALUES ($1, $2, $3, $4)', [
      orderId,
      applied.promoId,
      customerId,
      applied.discountMinor,
    ]);
  }

  /** A cancelled order gives the code back to the customer (and to the code's usage limit). */
  async release(client: pg.ClientBase | pg.Pool, orderId: string): Promise<void> {
    await client.query('UPDATE promo_redemptions SET released_at = now() WHERE order_id = $1 AND released_at IS NULL', [orderId]);
  }

  // ---------------------------------------------------------------- admin
  async list(): Promise<PromoCodeView[]> {
    const result = await this.pool.query<PromoRow & { redemptions: string; discount_given: string }>(
      `SELECT pc.*, count(r.order_id) FILTER (WHERE r.released_at IS NULL) AS redemptions,
              COALESCE(sum(r.discount_minor) FILTER (WHERE r.released_at IS NULL), 0) AS discount_given
         FROM promo_codes pc LEFT JOIN promo_redemptions r ON r.promo_code_id = pc.id
        GROUP BY pc.id ORDER BY pc.created_at DESC`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      description: row.description,
      kind: row.kind,
      value: row.value,
      maxDiscountMinor: row.max_discount_minor,
      minSubtotalMinor: row.min_subtotal_minor,
      startsAt: row.starts_at.toISOString(),
      endsAt: row.ends_at?.toISOString() ?? null,
      maxRedemptions: row.max_redemptions,
      firstOrderOnly: row.first_order_only,
      active: row.active,
      redemptions: Number(row.redemptions),
      discountGivenMinor: Number(row.discount_given),
    }));
  }

  async create(adminId: string, input: CreatePromoRequest): Promise<void> {
    try {
      const created = await this.pool.query<{ id: string }>(
        `INSERT INTO promo_codes (code, description, kind, value, max_discount_minor, min_subtotal_minor, starts_at, ends_at, max_redemptions, first_order_only, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()), $8, $9, $10, $11) RETURNING id`,
        [
          input.code, input.description ?? null, input.kind, input.value, input.maxDiscountMinor ?? null, input.minSubtotalMinor ?? 0,
          input.startsAt ?? null, input.endsAt ?? null, input.maxRedemptions ?? null, input.firstOrderOnly ?? false, adminId,
        ],
      );
      await recordAudit(this.pool, adminId, 'PROMO_CREATED', 'promo_code', created.rows[0]?.id as string, { code: input.code, kind: input.kind, value: input.value });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === '23505') throw new ConflictException('A code with this name already exists.');
      if (code === '23514') throw new BadRequestException('Check the dates and amounts of the code.');
      throw error;
    }
  }

  async setActive(adminId: string, promoId: string, active: boolean): Promise<void> {
    const updated = await this.pool.query('UPDATE promo_codes SET active = $2 WHERE id = $1', [promoId, active]);
    if (updated.rowCount !== 1) throw new NotFoundException('Code not found.');
    await recordAudit(this.pool, adminId, active ? 'PROMO_ACTIVATED' : 'PROMO_DEACTIVATED', 'promo_code', promoId);
  }
}

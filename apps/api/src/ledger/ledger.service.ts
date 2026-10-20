import type { LedgerEntryView, PartnerBalance, SettlementTransitionRequest, SettlementView } from '@flower-man/contracts';
import { assertSettlementTransition, type SettlementStatus } from '@flower-man/domain';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';

import { recordAudit } from '../common/audit.js';
import { PG_POOL } from '../database/database.module.js';
import { withTransaction } from '../database/transaction.js';
import { NotificationsService } from '../notifications/notifications.service.js';

interface SettlementRow {
  id: string;
  partner_id: string;
  partner_name: string;
  status: SettlementStatus;
  total_minor: number;
  entry_count: string;
  external_reference: string | null;
  failure_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

const toSettlement = (row: SettlementRow): SettlementView => ({
  id: row.id,
  partnerId: row.partner_id,
  partnerName: row.partner_name,
  status: row.status,
  totalMinor: row.total_minor,
  entryCount: Number(row.entry_count),
  externalReference: row.external_reference,
  failureReason: row.failure_reason,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const SETTLEMENT_SELECT = `
  SELECT s.id, s.partner_id, p.display_name AS partner_name, s.status, s.total_minor,
         (SELECT count(*) FROM ledger_entries e WHERE e.settlement_id = s.id) AS entry_count,
         s.external_reference, s.failure_reason, s.created_at, s.updated_at
    FROM settlements s JOIN partner_accounts p ON p.id = s.partner_id`;

/** Append-only earnings ledger (amounts in cents) and payout settlements. */
@Injectable()
export class LedgerService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Records seller revenue, platform commission and courier fee for a delivered order. Idempotent:
   * a unique constraint makes a second call a no-op, so earnings can never be counted twice.
   */
  async recordDeliveredOrder(client: pg.ClientBase, orderId: string): Promise<void> {
    const order = await client.query<{ seller_id: string; order_number: string; subtotal_minor: number; platform_commission_minor: number }>(
      'SELECT seller_id, order_number, subtotal_minor, platform_commission_minor FROM orders WHERE id = $1',
      [orderId],
    );
    const row = order.rows[0];
    if (!row) {
      throw new NotFoundException('Order not found.');
    }
    const label = `Order #${row.order_number}`;
    await this.insert(client, row.seller_id, 'ORDER_REVENUE', row.subtotal_minor, orderId, null, `${label}: flowers`);
    if (row.platform_commission_minor > 0) {
      await this.insert(client, row.seller_id, 'PLATFORM_COMMISSION', -row.platform_commission_minor, orderId, null, `${label}: platform commission`);
    }
    const delivery = await client.query<{ id: string; courier_id: string; fee_minor: number }>(
      `SELECT id, courier_id, fee_minor FROM deliveries WHERE order_id = $1 AND status = 'DELIVERED'`,
      [orderId],
    );
    const job = delivery.rows[0];
    if (job && job.fee_minor > 0) {
      await this.insert(client, job.courier_id, 'DELIVERY_FEE', job.fee_minor, orderId, job.id, `${label}: delivery`);
    }
  }

  /** A refund after delivery is charged back to the seller (never more than they earned on the order). */
  async recordRefundAdjustment(client: pg.ClientBase, orderId: string, refundMinor: number, refundId: string): Promise<void> {
    const earned = await client.query<{ seller_id: string; net: string | null; order_number: string }>(
      `SELECT o.seller_id, o.order_number,
              (SELECT sum(amount_minor) FROM ledger_entries e WHERE e.order_id = o.id AND e.partner_id = o.seller_id) AS net
         FROM orders o WHERE o.id = $1`,
      [orderId],
    );
    const row = earned.rows[0];
    const net = Number(row?.net ?? 0);
    const amount = Math.min(refundMinor, net);
    if (row && amount > 0) {
      await client.query(
        `INSERT INTO ledger_entries (partner_id, type, amount_minor, order_id, description)
         VALUES ($1, 'REFUND_ADJUSTMENT', $2, $3, $4)`,
        [row.seller_id, -amount, orderId, `Order #${row.order_number}: refund ${refundId}`],
      );
    }
  }

  async balances(): Promise<PartnerBalance[]> {
    const result = await this.pool.query<{ partner_id: string; display_name: string; kind: PartnerBalance['kind']; unsettled: string; entries: string }>(
      `SELECT e.partner_id, p.display_name, p.kind, sum(e.amount_minor) AS unsettled, count(*) AS entries
         FROM ledger_entries e JOIN partner_accounts p ON p.id = e.partner_id
        WHERE e.settlement_id IS NULL GROUP BY e.partner_id, p.display_name, p.kind
        ORDER BY sum(e.amount_minor) DESC`,
    );
    return result.rows.map((row) => ({
      partnerId: row.partner_id,
      displayName: row.display_name,
      kind: row.kind,
      unsettledMinor: Number(row.unsettled),
      unsettledEntries: Number(row.entries),
    }));
  }

  async entries(partnerId: string): Promise<{ balanceMinor: number; entries: LedgerEntryView[] }> {
    const result = await this.pool.query<{ id: string; type: string; amount_minor: number; description: string; order_id: string | null; settlement_id: string | null; created_at: Date }>(
      'SELECT id, type, amount_minor, description, order_id, settlement_id, created_at FROM ledger_entries WHERE partner_id = $1 ORDER BY id DESC LIMIT 500',
      [partnerId],
    );
    const unsettled = await this.pool.query<{ total: string | null }>(
      'SELECT sum(amount_minor) AS total FROM ledger_entries WHERE partner_id = $1 AND settlement_id IS NULL',
      [partnerId],
    );
    return {
      balanceMinor: Number(unsettled.rows[0]?.total ?? 0),
      entries: result.rows.map((row) => ({
        id: Number(row.id),
        type: row.type,
        amountMinor: row.amount_minor,
        description: row.description,
        orderId: row.order_id,
        settlementId: row.settlement_id,
        createdAt: row.created_at.toISOString(),
      })),
    };
  }

  async settlementsForPartner(partnerId: string): Promise<SettlementView[]> {
    const result = await this.pool.query<SettlementRow>(`${SETTLEMENT_SELECT} WHERE s.partner_id = $1 ORDER BY s.created_at DESC`, [partnerId]);
    return result.rows.map(toSettlement);
  }

  async listSettlements(status?: string): Promise<SettlementView[]> {
    const result = await this.pool.query<SettlementRow>(
      `${SETTLEMENT_SELECT} WHERE ($1::text IS NULL OR s.status = $1) ORDER BY s.created_at DESC LIMIT 500`,
      [status ?? null],
    );
    return result.rows.map(toSettlement);
  }

  /**
   * Bundles every unsettled entry of the partner into a new settlement. Entries are locked and re-checked,
   * so two concurrent requests cannot settle the same entry twice (the database trigger also refuses it).
   */
  async createSettlement(adminId: string, partnerId: string): Promise<SettlementView> {
    const settlementId = await withTransaction(this.pool, async (client) => {
      const locked = await client.query<{ id: string; amount_minor: number }>(
        'SELECT id, amount_minor FROM ledger_entries WHERE partner_id = $1 AND settlement_id IS NULL ORDER BY id FOR UPDATE',
        [partnerId],
      );
      const total = locked.rows.reduce((sum, row) => sum + row.amount_minor, 0);
      if (locked.rows.length === 0 || total <= 0) {
        throw new ConflictException('This partner has no positive unsettled balance.');
      }
      const created = await client.query<{ id: string }>(
        'INSERT INTO settlements (partner_id, total_minor, created_by) VALUES ($1, $2, $3) RETURNING id',
        [partnerId, total, adminId],
      );
      const id = created.rows[0]?.id as string;
      await client.query('UPDATE ledger_entries SET settlement_id = $1 WHERE id = ANY($2::bigint[])', [id, locked.rows.map((row) => row.id)]);
      await client.query(
        `INSERT INTO settlement_status_history (settlement_id, from_status, to_status, actor_user_id, note) VALUES ($1, NULL, 'CREATED', $2, $3)`,
        [id, adminId, `${locked.rows.length} entries`],
      );
      await recordAudit(client, adminId, 'SETTLEMENT_CREATED', 'settlement', id, { partnerId, totalMinor: total, entries: locked.rows.length });
      return id;
    });
    return this.getSettlement(settlementId);
  }

  async transitionSettlement(adminId: string, settlementId: string, input: SettlementTransitionRequest): Promise<SettlementView> {
    const partnerId = await withTransaction(this.pool, async (client) => {
      const found = await client.query<{ status: SettlementStatus; partner_id: string }>(
        'SELECT status, partner_id FROM settlements WHERE id = $1 FOR UPDATE',
        [settlementId],
      );
      const settlement = found.rows[0];
      if (!settlement) {
        throw new NotFoundException('Settlement not found.');
      }
      assertSettlementTransition(settlement.status, input.status);
      if (input.status === 'PAID' && !input.externalReference) {
        throw new BadRequestException('externalReference (bank transfer / provider reference) is required to mark a settlement paid.');
      }
      await client.query(
        `UPDATE settlements SET status = $2, external_reference = COALESCE($3, external_reference),
           failure_reason = CASE WHEN $2 = 'FAILED' THEN $4 ELSE failure_reason END, updated_at = now() WHERE id = $1`,
        [settlementId, input.status, input.externalReference ?? null, input.note ?? null],
      );
      if (input.status === 'FAILED') {
        // Entries become payable again in a future settlement; the history keeps the failed attempt.
        await client.query('UPDATE ledger_entries SET settlement_id = NULL WHERE settlement_id = $1', [settlementId]);
      }
      await client.query(
        'INSERT INTO settlement_status_history (settlement_id, from_status, to_status, actor_user_id, note) VALUES ($1, $2, $3, $4, $5)',
        [settlementId, settlement.status, input.status, adminId, input.note ?? input.externalReference ?? null],
      );
      await recordAudit(client, adminId, `SETTLEMENT_${input.status}`, 'settlement', settlementId, { externalReference: input.externalReference });
      return settlement.partner_id;
    });
    if (input.status === 'PAID') {
      await this.notifications.safely(() =>
        this.notifications.notifyPartner(partnerId, {
          type: 'SETTLEMENT_PAID',
          title: { it: 'Pagamento inviato', en: 'Payout sent' },
          body: { it: 'I tuoi guadagni Flower Man sono stati pagati.', en: 'Your Flower Man earnings have been paid out.' },
          data: { settlementId },
        }),
      );
    }
    return this.getSettlement(settlementId);
  }

  async getSettlement(settlementId: string): Promise<SettlementView> {
    const result = await this.pool.query<SettlementRow>(`${SETTLEMENT_SELECT} WHERE s.id = $1`, [settlementId]);
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Settlement not found.');
    }
    return toSettlement(row);
  }

  private async insert(
    client: pg.ClientBase,
    partnerId: string,
    type: string,
    amount: number,
    orderId: string,
    deliveryId: string | null,
    description: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO ledger_entries (partner_id, type, amount_minor, order_id, delivery_id, description)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (partner_id, type, order_id, delivery_id)
         WHERE type IN ('ORDER_REVENUE', 'DELIVERY_FEE', 'PLATFORM_COMMISSION') DO NOTHING`,
      [partnerId, type, amount, orderId, deliveryId, description],
    );
  }
}

import type { PaymentInstructions } from '@flower-man/contracts';
import { PAID_ORDER_STATUSES } from '@flower-man/domain';
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import pg from 'pg';

import { recordAudit } from '../common/audit.js';
import { PG_POOL } from '../database/database.module.js';
import { withTransaction } from '../database/transaction.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { euros, NotificationsService } from '../notifications/notifications.service.js';
import { lockOrder, transitionOrder } from '../orders/order-workflow.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.js';

interface PaymentRow {
  id: string;
  order_id: string;
  provider: 'SIMULATED' | 'STRIPE';
  provider_ref: string;
  amount_minor: number;
  status: string;
  refunded_minor: number;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Payment instructions for an unpaid order: reuses the existing intent or creates one.
   * The amount always comes from the order row (computed server-side at checkout).
   */
  async instructionsFor(orderId: string): Promise<PaymentInstructions> {
    const order = await this.pool.query<{ status: string; total_minor: number }>('SELECT status, total_minor FROM orders WHERE id = $1', [orderId]);
    const row = order.rows[0];
    if (!row) {
      throw new NotFoundException('Order not found.');
    }
    if (row.status !== 'PENDING_PAYMENT') {
      throw new ConflictException('This order does not need payment.');
    }
    const existing = await this.pool.query<PaymentRow>('SELECT * FROM payments WHERE order_id = $1', [orderId]);
    if (existing.rows[0]) {
      const payment = existing.rows[0];
      // Stripe returns the same intent (and client secret) for the same idempotency key.
      const intent = payment.provider === 'STRIPE' ? await this.provider.createIntent({ orderId, amountMinor: payment.amount_minor, currency: 'EUR' }) : null;
      return { provider: payment.provider, reference: payment.provider_ref, clientSecret: intent?.clientSecret ?? null, amountMinor: payment.amount_minor, currency: 'EUR' };
    }
    const intent = await this.provider.createIntent({ orderId, amountMinor: row.total_minor, currency: 'EUR' });
    await this.pool.query(
      `INSERT INTO payments (order_id, provider, provider_ref, amount_minor) VALUES ($1, $2, $3, $4) ON CONFLICT (order_id) DO NOTHING`,
      [orderId, this.provider.name, intent.reference, row.total_minor],
    );
    return { provider: this.provider.name, reference: intent.reference, clientSecret: intent.clientSecret, amountMinor: row.total_minor, currency: 'EUR' };
  }

  /**
   * Called only from a verified provider webhook (or the development-only simulator). Idempotent.
   * If the order was already cancelled (e.g. payment arrived after expiry) the money is refunded automatically.
   */
  async markSucceeded(reference: string, amountReceivedMinor: number): Promise<void> {
    const outcome = await withTransaction(this.pool, async (client) => {
      const found = await client.query<PaymentRow>('SELECT * FROM payments WHERE provider_ref = $1 FOR UPDATE', [reference]);
      const payment = found.rows[0];
      if (!payment) {
        this.logger.warn(`Payment success for unknown reference ${reference}`);
        return 'UNKNOWN' as const;
      }
      if (payment.status !== 'REQUIRES_PAYMENT' && payment.status !== 'FAILED') {
        return 'ALREADY' as const;
      }
      if (amountReceivedMinor !== payment.amount_minor) {
        this.logger.error(`Amount mismatch for ${reference}: expected ${payment.amount_minor}, received ${amountReceivedMinor}`);
      }
      await client.query(`UPDATE payments SET status = 'SUCCEEDED', failure_reason = NULL, updated_at = now() WHERE id = $1`, [payment.id]);
      const order = await lockOrder(client, payment.order_id);
      if (order.status === 'PENDING_PAYMENT') {
        await transitionOrder(client, order, 'PAID', 'SYSTEM', null, 'Payment confirmed');
        return { kind: 'PAID' as const, order };
      }
      return { kind: 'LATE' as const, order };
    });

    if (typeof outcome === 'string') {
      return;
    }
    if (outcome.kind === 'LATE') {
      await this.refund(outcome.order.id, null, 'Payment arrived after the order was cancelled', null);
      return;
    }
    const { order } = outcome;
    await this.notifications.safely(async () => {
      await this.notifications.notifyUser(order.customerId, {
        type: 'ORDER_PAID',
        title: { it: 'Pagamento ricevuto', en: 'Payment received' },
        body: { it: `L'ordine #${order.orderNumber} è pagato. Il fiorista lo confermerà a breve.`, en: `Order #${order.orderNumber} is paid. The florist will confirm it shortly.` },
        data: { orderId: order.id },
      });
      await this.notifications.notifyPartner(order.sellerId, {
        type: 'NEW_ORDER',
        title: { it: 'Nuovo ordine', en: 'New order' },
        body: { it: `L'ordine #${order.orderNumber} attende la tua conferma.`, en: `Order #${order.orderNumber} is waiting for confirmation.` },
        data: { orderId: order.id },
      });
    });
  }

  async markFailed(reference: string, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE payments SET status = 'FAILED', failure_reason = $2, updated_at = now() WHERE provider_ref = $1 AND status = 'REQUIRES_PAYMENT'`,
      [reference, reason.slice(0, 300)],
    );
  }

  /**
   * Refunds a paid order (full when amount is null). Fully refunded orders move to REFUNDED.
   * After delivery, the refund is charged back to the seller in the ledger.
   */
  async refund(orderId: string, amountMinor: number | null, reason: string, actorUserId: string | null): Promise<void> {
    const plan = await withTransaction(this.pool, async (client) => {
      const order = await lockOrder(client, orderId);
      const found = await client.query<PaymentRow>('SELECT * FROM payments WHERE order_id = $1 FOR UPDATE', [orderId]);
      const payment = found.rows[0];
      if (!payment || (payment.status !== 'SUCCEEDED' && payment.status !== 'PARTIALLY_REFUNDED')) {
        throw new ConflictException('This order has no captured payment to refund.');
      }
      if (order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && !PAID_ORDER_STATUSES.includes(order.status)) {
        throw new ConflictException(`An order in status ${order.status} cannot be refunded.`);
      }
      const remaining = payment.amount_minor - payment.refunded_minor;
      const amount = amountMinor ?? remaining;
      if (amount <= 0 || amount > remaining) {
        throw new BadRequestException(`Refund amount must be between 1 and ${remaining} cents.`);
      }
      return { order, payment, amount, full: amount === remaining };
    });

    // External call outside the transaction; the idempotency key makes a retry safe.
    const refunded = await this.provider.refund({
      reference: plan.payment.provider_ref,
      amountMinor: plan.amount,
      idempotencyKey: `refund-${orderId}-${plan.payment.refunded_minor}-${plan.amount}`,
    });

    await withTransaction(this.pool, async (client) => {
      const order = await lockOrder(client, orderId);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO refunds (payment_id, amount_minor, provider_ref, reason, created_by) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (provider_ref) DO NOTHING RETURNING id`,
        [plan.payment.id, plan.amount, refunded.reference, reason, actorUserId],
      );
      const refundId = inserted.rows[0]?.id;
      if (!refundId) {
        return; // already recorded (retry)
      }
      await client.query(
        `UPDATE payments SET refunded_minor = refunded_minor + $2,
           status = CASE WHEN refunded_minor + $2 >= amount_minor THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END, updated_at = now()
         WHERE id = $1`,
        [plan.payment.id, plan.amount],
      );
      if (order.status === 'DELIVERED') {
        await this.ledger.recordRefundAdjustment(client, orderId, plan.amount, refundId);
      }
      if (plan.full && (order.status === 'CANCELLED' || order.status === 'DELIVERED')) {
        await transitionOrder(client, order, 'REFUNDED', actorUserId ? 'ADMIN' : 'SYSTEM', actorUserId, reason);
      }
      if (actorUserId) {
        await recordAudit(client, actorUserId, 'ORDER_REFUNDED', 'order', orderId, { amountMinor: plan.amount, reason });
      }
    });

    await this.notifications.safely(() =>
      this.notifications.notifyUser(plan.order.customerId, {
        type: 'ORDER_REFUNDED',
        title: { it: 'Rimborso effettuato', en: 'Refund issued' },
        body: {
          it: `Ti abbiamo rimborsato ${euros(plan.amount).it} per l'ordine #${plan.order.orderNumber}.`,
          en: `We refunded ${euros(plan.amount).en} for order #${plan.order.orderNumber}.`,
        },
        data: { orderId },
      }),
    );
  }

  /** Webhook idempotency: true the first time an event ID is seen. */
  async firstTimeSeen(provider: string, eventId: string, type: string): Promise<boolean> {
    const result = await this.pool.query(
      'INSERT INTO payment_events (provider, event_id, type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [provider, eventId, type],
    );
    return result.rowCount === 1;
  }

  async forgetEvent(provider: string, eventId: string): Promise<void> {
    await this.pool.query('DELETE FROM payment_events WHERE provider = $1 AND event_id = $2', [provider, eventId]);
  }

  async amountFor(reference: string): Promise<number> {
    const result = await this.pool.query<{ amount_minor: number }>('SELECT amount_minor FROM payments WHERE provider_ref = $1', [reference]);
    const amount = result.rows[0]?.amount_minor;
    if (amount === undefined) {
      throw new NotFoundException('Payment not found.');
    }
    return amount;
  }

  get providerName(): 'SIMULATED' | 'STRIPE' {
    return this.provider.name;
  }
}

import type { Language, OrderDetail } from '@flower-man/contracts';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import pg from 'pg';

import { PG_POOL } from '../database/database.module.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { loadOrderDetail } from './order-views.js';

const euro = (minor: number, language: Language) => {
  const amount = (minor / 100).toFixed(2);
  return language === 'it' ? `${amount.replace('.', ',')} €` : `€${amount}`;
};

const TEXT = {
  it: {
    subject: (n: number) => `Flower Man: riepilogo dell'ordine #${n}`,
    intro: 'Grazie per il tuo ordine. Ecco il riepilogo.',
    order: 'Ordine', date: 'Data', seller: 'Fiorista', items: 'Articoli', delivery: 'Consegna', discount: 'Sconto', tip: 'Mancia al corriere',
    total: 'Totale pagato', to: 'Destinatario', when: 'Consegna richiesta', asap: 'il prima possibile',
    note: 'Questo è un riepilogo dell’ordine, non un documento fiscale. Per la ricevuta o la fattura rivolgiti al fiorista.',
  },
  en: {
    subject: (n: number) => `Flower Man: summary of order #${n}`,
    intro: 'Thank you for your order. Here is the summary.',
    order: 'Order', date: 'Date', seller: 'Florist', items: 'Items', delivery: 'Delivery', discount: 'Discount', tip: 'Courier tip',
    total: 'Total paid', to: 'Recipient', when: 'Requested delivery', asap: 'as soon as possible',
    note: 'This is an order summary, not a tax document. For a receipt or invoice, please contact the florist.',
  },
} as const;

/** Plain-text order summary in the customer's language. Exported for tests. */
export function receiptText(order: OrderDetail, language: Language): { subject: string; text: string } {
  const l = TEXT[language];
  const locale = language === 'it' ? 'it-IT' : 'en-GB';
  const when = (iso: string) => new Date(iso).toLocaleString(locale, { timeZone: 'Europe/Rome', dateStyle: 'medium', timeStyle: 'short' });
  const lines = [
    l.intro,
    '',
    `${l.order}: #${order.orderNumber}`,
    `${l.date}: ${when(order.createdAt)}`,
    `${l.seller}: ${order.sellerName}`,
    '',
    `${l.items}:`,
    ...order.items.map((item) => `  ${item.quantity} × ${item.name}  ${euro(item.lineTotalMinor, language)}`),
    `${l.delivery}: ${euro(order.deliveryFeeMinor, language)}`,
    ...(order.discountMinor > 0 ? [`${l.discount}: −${euro(order.discountMinor, language)}`] : []),
    ...(order.tipMinor > 0 ? [`${l.tip}: ${euro(order.tipMinor, language)}`] : []),
    `${l.total}: ${euro(order.totalMinor, language)}`,
    '',
    `${l.to}: ${order.recipientName}, ${order.deliveryAddress}`,
    `${l.when}: ${order.requestedDeliveryAt ? when(order.requestedDeliveryAt) : l.asap}`,
    '',
    l.note,
  ];
  return { subject: l.subject(order.orderNumber), text: lines.join('\n') };
}

/** Emails the order summary to the customer: automatically once paid, or again on request. */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger('Receipts');

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  /** customerId: when set, the order must belong to that customer. */
  async send(orderId: string, customerId: string | null = null): Promise<void> {
    const order = await loadOrderDetail(this.pool, orderId, customerId ? 'o.customer_id = $2' : 'true', customerId);
    if (!order || order.status === 'PENDING_PAYMENT') {
      throw new NotFoundException('Order not found.');
    }
    const user = await this.pool.query<{ email: string; language: Language }>('SELECT u.email, u.language FROM users u JOIN orders o ON o.customer_id = u.id WHERE o.id = $1', [orderId]);
    const recipient = user.rows[0];
    if (!recipient) {
      throw new NotFoundException('Order not found.');
    }
    const { subject, text } = receiptText(order, recipient.language);
    await this.mailer.send({ to: recipient.email, subject, text });
  }

  /** Never throws: a failed email must not undo the payment that triggered it. */
  async sendSafely(orderId: string): Promise<void> {
    await this.send(orderId).catch((error: unknown) => this.logger.error(`Receipt for ${orderId} failed: ${(error as Error).message}`));
  }
}

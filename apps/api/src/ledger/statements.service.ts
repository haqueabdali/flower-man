import type { Language } from '@flower-man/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import pg from 'pg';

import { PG_POOL } from '../database/database.module.js';
import { MAILER, type Mailer } from '../mail/mailer.js';

export interface StatementTotals {
  readonly flowers: number;
  readonly commission: number;
  readonly deliveryFees: number;
  readonly tips: number;
  readonly adjustments: number;
  readonly net: number;
  readonly paidOut: number;
  readonly balance: number;
}

const LABELS = {
  it: {
    subject: (name: string, month: string) => `Flower Man: estratto conto ${month} – ${name}`,
    intro: (month: string) => `Ecco il riepilogo dei tuoi guadagni di ${month}.`,
    flowers: 'Fiori venduti', commission: 'Commissione piattaforma', deliveryFees: 'Consegne', tips: 'Mance',
    adjustments: 'Rettifiche (rimborsi)', net: 'Guadagno netto del mese', paidOut: 'Pagato nel mese', balance: 'Saldo da pagare oggi',
    footer: 'I dettagli di ogni ordine sono nell’app, nella sezione Guadagni.',
  },
  en: {
    subject: (name: string, month: string) => `Flower Man: ${month} statement – ${name}`,
    intro: (month: string) => `Here is the summary of your earnings for ${month}.`,
    flowers: 'Flowers sold', commission: 'Platform commission', deliveryFees: 'Deliveries', tips: 'Tips',
    adjustments: 'Adjustments (refunds)', net: 'Net earnings for the month', paidOut: 'Paid out during the month', balance: 'Balance to be paid today',
    footer: 'Every order is detailed in the app, under Earnings.',
  },
} as const;

/** Statement email text; lines with a zero amount are left out. Exported for tests. */
export function statementText(name: string, monthStart: Date, totals: StatementTotals, language: Language): { subject: string; text: string } {
  const l = LABELS[language];
  const month = monthStart.toLocaleDateString(language === 'it' ? 'it-IT' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const euro = (minor: number) => {
    const amount = (Math.abs(minor) / 100).toFixed(2);
    const sign = minor < 0 ? '−' : '';
    return language === 'it' ? `${sign}${amount.replace('.', ',')} €` : `${sign}€${amount}`;
  };
  const line = (label: string, minor: number) => (minor === 0 ? [] : [`${label}: ${euro(minor)}`]);
  return {
    subject: l.subject(name, month),
    text: [
      l.intro(month),
      '',
      ...line(l.flowers, totals.flowers),
      ...line(l.commission, totals.commission),
      ...line(l.deliveryFees, totals.deliveryFees),
      ...line(l.tips, totals.tips),
      ...line(l.adjustments, totals.adjustments),
      `${l.net}: ${euro(totals.net)}`,
      '',
      `${l.paidOut}: ${euro(totals.paidOut)}`,
      `${l.balance}: ${euro(totals.balance)}`,
      '',
      l.footer,
    ].join('\n'),
  };
}

/** Sends last month's statement to each partner with ledger activity, once (claimed in partner_statements). */
@Injectable()
export class StatementsService {
  private readonly logger = new Logger('Statements');

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async sendLastMonth(): Promise<number> {
    const claimed = await this.pool.query<{ partner_id: string; month: Date }>(
      `WITH bounds AS (
         SELECT (date_trunc('month', now() AT TIME ZONE 'Europe/Rome') - interval '1 month')::date AS month,
                (date_trunc('month', now() AT TIME ZONE 'Europe/Rome') - interval '1 month') AT TIME ZONE 'Europe/Rome' AS starts,
                date_trunc('month', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome' AS ends)
       INSERT INTO partner_statements (partner_id, month)
       SELECT DISTINCT e.partner_id, b.month FROM ledger_entries e, bounds b
        WHERE e.created_at >= b.starts AND e.created_at < b.ends
       ON CONFLICT DO NOTHING
       RETURNING partner_id, month`,
    );
    for (const row of claimed.rows) {
      await this.send(row.partner_id, row.month).catch((error: unknown) => this.logger.error(`Statement for ${row.partner_id} failed: ${(error as Error).message}`));
    }
    return claimed.rows.length;
  }

  private async send(partnerId: string, month: Date): Promise<void> {
    const result = await this.pool.query<Record<string, string> & { display_name: string; email: string; language: Language }>(
      `WITH bounds AS (SELECT $2::date::timestamp AT TIME ZONE 'Europe/Rome' AS starts,
                              ($2::date + interval '1 month')::timestamp AT TIME ZONE 'Europe/Rome' AS ends),
            month_entries AS (SELECT e.type, e.amount_minor FROM ledger_entries e, bounds b
                               WHERE e.partner_id = $1 AND e.created_at >= b.starts AND e.created_at < b.ends)
       SELECT p.display_name, u.email, u.language,
              (SELECT COALESCE(sum(amount_minor), 0) FROM month_entries WHERE type = 'ORDER_REVENUE') AS flowers,
              (SELECT COALESCE(sum(amount_minor), 0) FROM month_entries WHERE type = 'PLATFORM_COMMISSION') AS commission,
              (SELECT COALESCE(sum(amount_minor), 0) FROM month_entries WHERE type = 'DELIVERY_FEE') AS delivery_fees,
              (SELECT COALESCE(sum(amount_minor), 0) FROM month_entries WHERE type = 'COURIER_TIP') AS tips,
              (SELECT COALESCE(sum(amount_minor), 0) FROM month_entries WHERE type IN ('REFUND_ADJUSTMENT', 'PAYOUT_ADJUSTMENT')) AS adjustments,
              (SELECT COALESCE(sum(total_minor), 0) FROM settlements s, bounds b
                WHERE s.partner_id = p.id AND s.status = 'PAID' AND s.updated_at >= b.starts AND s.updated_at < b.ends) AS paid_out,
              (SELECT COALESCE(sum(amount_minor), 0) FROM ledger_entries WHERE partner_id = p.id AND settlement_id IS NULL) AS balance
         FROM partner_accounts p JOIN users u ON u.id = p.owner_user_id WHERE p.id = $1`,
      [partnerId, month.toISOString().slice(0, 10)],
    );
    const row = result.rows[0];
    if (!row) return;
    const n = (key: string) => Number(row[key] ?? 0);
    const totals: StatementTotals = {
      flowers: n('flowers'),
      commission: n('commission'),
      deliveryFees: n('delivery_fees'),
      tips: n('tips'),
      adjustments: n('adjustments'),
      net: n('flowers') + n('commission') + n('delivery_fees') + n('tips') + n('adjustments'),
      paidOut: n('paid_out'),
      balance: n('balance'),
    };
    const { subject, text } = statementText(row.display_name, month, totals, row.language);
    await this.mailer.send({ to: row.email, subject, text });
  }
}

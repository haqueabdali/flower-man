import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import pg from 'pg';

import { PG_POOL } from '../database/database.module.js';
import { MAILER, type Mailer } from '../mail/mailer.js';

const EXPORT_INTERVAL_MINUTES = 60;

/**
 * GDPR access and portability: a JSON copy of the personal data we hold about the signed-in user, emailed to their own
 * (verified) address. Secrets are never included: no password hash, no tokens, no full IP history beyond 12 months.
 */
@Injectable()
export class DataExportService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async build(userId: string): Promise<Record<string, unknown>> {
    const rows = async (sql: string) => (await this.pool.query(sql, [userId])).rows;
    const [user] = await rows(
      `SELECT id, email, full_name, phone, language, status, email_verified_at, created_at,
              COALESCE((SELECT array_agg(capability ORDER BY capability) FROM user_capabilities WHERE user_id = users.id), '{}') AS capabilities
         FROM users WHERE id = $1`,
    );
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return {
      exportedAt: new Date().toISOString(),
      notice: 'Personal data held by Flower Man about you (GDPR art. 15 and 20). Questions: reply to this email.',
      account: user,
      orders: await rows(
        `SELECT o.order_number, o.status, o.created_at, o.subtotal_minor, o.delivery_fee_minor, o.discount_minor, o.tip_minor, o.total_minor,
                o.recipient_name, o.recipient_phone, o.delivery_address, o.delivery_notes, o.gift_message, o.requested_delivery_at,
                p.display_name AS seller,
                (SELECT json_agg(json_build_object('name', i.name, 'quantity', i.quantity, 'lineTotalMinor', i.line_total_minor)) FROM order_items i WHERE i.order_id = o.id) AS items
           FROM orders o JOIN partner_accounts p ON p.id = o.seller_id WHERE o.customer_id = $1 ORDER BY o.created_at`,
      ),
      customRequests: await rows(
        `SELECT occasion, flower_preferences, colour_preferences, notes, budget_minor, delivery_window_start, delivery_window_end,
                recipient_name, recipient_phone, delivery_address, status, created_at
           FROM custom_requests WHERE customer_id = $1 ORDER BY created_at`,
      ),
      reviews: await rows(
        `SELECT o.order_number, r.seller_rating, r.courier_rating, r.comment, r.created_at, r.hidden_at
           FROM order_reviews r JOIN orders o ON o.id = r.order_id WHERE r.customer_id = $1 ORDER BY r.created_at`,
      ),
      favouriteFlorists: await rows(
        `SELECT p.display_name, f.created_at FROM customer_favourites f JOIN partner_accounts p ON p.id = f.seller_id WHERE f.customer_id = $1`,
      ),
      partnerAccounts: await rows(
        `SELECT p.kind, p.display_name, p.legal_name, p.vat_number, p.phone, p.address, p.description, p.verification_status, m.role, p.created_at
           FROM partner_members m JOIN partner_accounts p ON p.id = m.partner_id WHERE m.user_id = $1`,
      ),
      notifications: await rows(`SELECT type, title, body, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500`),
      signInHistory: await rows(
        `SELECT type, occurred_at, host(ip) AS ip, user_agent FROM security_events
          WHERE user_id = $1 AND occurred_at > now() - interval '12 months' ORDER BY occurred_at DESC LIMIT 500`,
      ),
      devices: await rows(`SELECT platform, app, created_at, last_seen_at FROM push_tokens WHERE user_id = $1`),
    };
  }

  /** Emails the export as a JSON attachment to the account's verified email. At most once per hour. */
  async emailExport(userId: string): Promise<void> {
    const claimed = await this.pool.query<{ email: string; language: string }>(
      `UPDATE users SET data_export_requested_at = now()
        WHERE id = $1 AND email_verified_at IS NOT NULL
          AND (data_export_requested_at IS NULL OR data_export_requested_at < now() - make_interval(mins => $2))
        RETURNING email, language`,
      [userId, EXPORT_INTERVAL_MINUTES],
    );
    const user = claimed.rows[0];
    if (!user) {
      throw new ConflictException('You can request a copy of your data once per hour, after confirming your email.');
    }
    const data = await this.build(userId);
    const italian = user.language === 'it';
    await this.mailer.send({
      to: user.email,
      subject: italian ? 'Flower Man: copia dei tuoi dati' : 'Flower Man: a copy of your data',
      text: italian
        ? 'In allegato trovi una copia dei dati personali che Flower Man conserva su di te (file JSON).\nSe non hai richiesto tu questa copia, cambia la password.'
        : 'Attached is a copy of the personal data Flower Man holds about you (JSON file).\nIf you did not ask for this copy, change your password.',
      attachments: [{ filename: `flower-man-data-${new Date().toISOString().slice(0, 10)}.json`, content: JSON.stringify(data, null, 2), contentType: 'application/json' }],
    });
  }
}

import type { NotificationItem, PushTokenRequest } from '@flower-man/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';
import pg from 'pg';

import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { PG_POOL } from '../database/database.module.js';

/** Text in every supported language; each recipient gets theirs (users.language). */
export interface Localized {
  readonly it: string;
  readonly en: string;
}

export interface NotificationMessage {
  readonly type: string;
  readonly title: Localized;
  readonly body: Localized;
  readonly data?: Record<string, string>;
}

/** "€29.90" / "29,90 €" */
export function euros(minor: number): Localized {
  const amount = (minor / 100).toFixed(2);
  return { it: `${amount.replace('.', ',')} €`, en: `€${amount}` };
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Stores every notification in the user's in-app inbox, then (when PUSH_ENABLED) sends it to their
 * registered Expo push tokens in the background. Push is best effort: the inbox is the source of truth.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async notifyUser(userId: string, message: NotificationMessage): Promise<void> {
    // The text is rendered once, in the recipient's language, and stored like that in the inbox.
    const inserted = await this.pool.query<{ id: string; title: string; body: string }>(
      `INSERT INTO notifications (user_id, type, title, body, data, push_status)
       SELECT u.id, $2, CASE u.language WHEN 'en' THEN $4 ELSE $3 END, CASE u.language WHEN 'en' THEN $6 ELSE $5 END, $7, $8
         FROM users u WHERE u.id = $1
       RETURNING id, title, body`,
      [userId, message.type, message.title.it, message.title.en, message.body.it, message.body.en, JSON.stringify(message.data ?? {}), this.config.push.enabled ? 'PENDING' : 'DISABLED'],
    );
    const row = inserted.rows[0];
    if (row && this.config.push.enabled) {
      void this.push(row.id, userId, { type: message.type, title: row.title, body: row.body, data: message.data ?? {} });
    }
  }

  /** Notifies every member (owner and staff) of a partner account. */
  async notifyPartner(partnerId: string, message: NotificationMessage): Promise<void> {
    const members = await this.pool.query<{ user_id: string }>('SELECT user_id FROM partner_members WHERE partner_id = $1', [partnerId]);
    for (const member of members.rows) {
      await this.notifyUser(member.user_id, message);
    }
  }

  /** Never throws: notification failures must not break the business operation that triggered them. */
  async safely(work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.error(`Notification failed: ${(error as Error).message}`);
    }
  }

  async registerToken(userId: string, request: PushTokenRequest): Promise<void> {
    // A device token belongs to whoever signed in last on that device.
    await this.pool.query(
      `INSERT INTO push_tokens (token, user_id, platform, app) VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform,
         app = EXCLUDED.app, last_seen_at = now()`,
      [request.token, userId, request.platform, request.app],
    );
  }

  async removeToken(userId: string, token: string): Promise<void> {
    await this.pool.query('DELETE FROM push_tokens WHERE token = $1 AND user_id = $2', [token, userId]);
  }

  async list(userId: string): Promise<NotificationItem[]> {
    const result = await this.pool.query<{ id: string; type: string; title: string; body: string; data: Record<string, string>; created_at: Date; read_at: Date | null }>(
      'SELECT id, type, title, body, data, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100',
      [userId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      data: row.data,
      createdAt: row.created_at.toISOString(),
      readAt: row.read_at?.toISOString() ?? null,
    }));
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.pool.query('UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2', [notificationId, userId]);
  }

  private async push(notificationId: string, userId: string, message: { type: string; title: string; body: string; data: Record<string, string> }): Promise<void> {
    try {
      const tokens = await this.pool.query<{ token: string }>('SELECT token FROM push_tokens WHERE user_id = $1', [userId]);
      if (tokens.rows.length === 0) {
        await this.pool.query(`UPDATE notifications SET push_status = 'NO_DEVICE' WHERE id = $1`, [notificationId]);
        return;
      }
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.config.push.expoAccessToken ? { Authorization: `Bearer ${this.config.push.expoAccessToken}` } : {}),
        },
        body: JSON.stringify(
          tokens.rows.map((row) => ({
            to: row.token,
            title: message.title,
            body: message.body,
            data: { ...message.data, type: message.type, notificationId },
            sound: 'default',
          })),
        ),
        signal: AbortSignal.timeout(10_000),
      });
      const payload = (await response.json().catch(() => ({}))) as { data?: { status?: string; details?: { error?: string } }[] };
      // Tokens of uninstalled apps are reported as DeviceNotRegistered: forget them.
      payload.data?.forEach((ticket, index) => {
        const token = tokens.rows[index]?.token;
        if (token && ticket.details?.error === 'DeviceNotRegistered') {
          void this.pool.query('DELETE FROM push_tokens WHERE token = $1', [token]);
        }
      });
      await this.pool.query('UPDATE notifications SET push_status = $2 WHERE id = $1', [notificationId, response.ok ? 'SENT' : 'FAILED']);
    } catch (error) {
      this.logger.warn(`Push failed for notification ${notificationId}: ${(error as Error).message}`);
      await this.pool.query(`UPDATE notifications SET push_status = 'FAILED' WHERE id = $1`, [notificationId]).catch(() => undefined);
    }
  }
}

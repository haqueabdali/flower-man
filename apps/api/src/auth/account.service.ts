import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import pg from 'pg';

import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { PG_POOL } from '../database/database.module.js';
import { withTransaction } from '../database/transaction.js';
import { MAILER, type Mailer, type MailMessage } from '../mail/mailer.js';
import { hashPassword } from './password.js';
import { recordSecurityEvent, type RequestMeta } from './security-events.js';
import { generateRefreshToken as generateOpaqueToken, hashToken } from './tokens.js';

type Purpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

const TTL_MINUTES: Readonly<Record<Purpose, number>> = {
  EMAIL_VERIFICATION: 24 * 60,
  PASSWORD_RESET: 30,
};

const INVALID_LINK = 'This link is invalid or has expired. Request a new one.';

export type VerificationEmailResult = 'SENT' | 'ALREADY_VERIFIED';

/** Email verification and password recovery. Tokens are single use and stored only as hashes. */
@Injectable()
export class AccountService {
  private readonly logger = new Logger('AccountService');

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async sendVerificationEmail(userId: string, meta: RequestMeta): Promise<VerificationEmailResult> {
    const user = await this.pool.query<{ email: string; full_name: string; verified: boolean }>(
      `SELECT email, full_name, email_verified_at IS NOT NULL AS verified FROM users WHERE id = $1 AND status = 'ACTIVE'`,
      [userId],
    );
    const row = user.rows[0];
    if (!row || row.verified) {
      return 'ALREADY_VERIFIED';
    }
    const token = await withTransaction(this.pool, async (client) => {
      const issued = await this.issueToken(client, userId, 'EMAIL_VERIFICATION', row.email);
      await recordSecurityEvent(client, 'EMAIL_VERIFICATION_SENT', userId, null, meta);
      return issued;
    });
    this.deliver({
      to: row.email,
      subject: 'Flower Man: conferma il tuo indirizzo email / confirm your email',
      text: [
        `Ciao ${row.full_name},`,
        '',
        'conferma il tuo indirizzo email aprendo questo link (valido 24 ore):',
        'please confirm your email address by opening this link (valid for 24 hours):',
        '',
        this.link('verify-email', token),
        '',
        'Se non hai creato un account Flower Man, ignora questa email.',
        'If you did not create a Flower Man account, ignore this email.',
      ].join('\n'),
    });
    return 'SENT';
  }

  async confirmEmail(token: string, meta: RequestMeta): Promise<void> {
    const confirmed = await withTransaction(this.pool, async (client) => {
      const row = await this.consumeToken(client, token, 'EMAIL_VERIFICATION');
      if (!row) {
        return false;
      }
      // Only valid if the account still has the address the link was sent to.
      const updated = await client.query(
        `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
          WHERE id = $1 AND email = $2 AND status = 'ACTIVE'`,
        [row.user_id, row.email],
      );
      if (updated.rowCount !== 1) {
        return false;
      }
      await recordSecurityEvent(client, 'EMAIL_VERIFIED', row.user_id, null, meta);
      return true;
    });
    if (!confirmed) {
      throw new BadRequestException(INVALID_LINK);
    }
  }

  /** Always succeeds from the caller's point of view, so it cannot be used to discover accounts. */
  async requestPasswordReset(email: string, meta: RequestMeta): Promise<void> {
    const user = await this.pool.query<{ id: string; email: string; full_name: string }>(
      `SELECT id, email, full_name FROM users WHERE email_normalized = $1 AND status = 'ACTIVE'`,
      [email.trim().toLowerCase()],
    );
    const row = user.rows[0];
    if (!row) {
      return;
    }
    const token = await withTransaction(this.pool, async (client) => {
      const issued = await this.issueToken(client, row.id, 'PASSWORD_RESET', row.email);
      await recordSecurityEvent(client, 'PASSWORD_RESET_REQUESTED', row.id, null, meta);
      return issued;
    });
    this.deliver({
      to: row.email,
      subject: 'Flower Man: reimposta la password / reset your password',
      text: [
        `Ciao ${row.full_name},`,
        '',
        'per scegliere una nuova password apri questo link (valido 30 minuti):',
        'to choose a new password, open this link (valid for 30 minutes):',
        '',
        this.link('reset-password', token),
        '',
        'Se non hai richiesto tu il reset, ignora questa email: la password attuale resta valida.',
        'If you did not ask for a reset, ignore this email: your current password stays valid.',
      ].join('\n'),
    });
  }

  /** Sets the new password and signs out every session of the account. */
  async confirmPasswordReset(token: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    const done = await withTransaction(this.pool, async (client) => {
      const row = await this.consumeToken(client, token, 'PASSWORD_RESET');
      if (!row) {
        return false;
      }
      const user = await client.query<{ email: string }>(
        `SELECT email FROM users WHERE id = $1 AND status = 'ACTIVE' FOR UPDATE`,
        [row.user_id],
      );
      if (user.rows[0]?.email !== row.email) {
        return false;
      }
      await client.query('UPDATE user_credentials SET password_hash = $2, password_changed_at = now() WHERE user_id = $1', [
        row.user_id,
        passwordHash,
      ]);
      // Opening the link proves control of the mailbox.
      await client.query(
        'UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1',
        [row.user_id],
      );
      await client.query(
        `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'PASSWORD_CHANGED'
          WHERE user_id = $1 AND revoked_at IS NULL`,
        [row.user_id],
      );
      await client.query(
        `UPDATE auth_refresh_tokens t SET used_at = now()
           FROM auth_sessions s WHERE s.id = t.session_id AND s.user_id = $1 AND t.used_at IS NULL`,
        [row.user_id],
      );
      await client.query(
        `UPDATE auth_action_tokens SET used_at = now() WHERE user_id = $1 AND purpose = 'PASSWORD_RESET' AND used_at IS NULL`,
        [row.user_id],
      );
      await recordSecurityEvent(client, 'PASSWORD_RESET_COMPLETED', row.user_id, null, meta);
      return true;
    });
    if (!done) {
      throw new BadRequestException(INVALID_LINK);
    }
  }

  /** Creates a new token and invalidates older unused ones of the same purpose. Returns the raw token. */
  private async issueToken(client: pg.PoolClient, userId: string, purpose: Purpose, email: string): Promise<string> {
    await client.query(
      'UPDATE auth_action_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL',
      [userId, purpose],
    );
    const token = generateOpaqueToken();
    await client.query(
      `INSERT INTO auth_action_tokens (token_hash, user_id, purpose, email, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
      [hashToken(token), userId, purpose, email, TTL_MINUTES[purpose]],
    );
    return token;
  }

  /** Marks a valid token as used and returns it, or undefined if unknown, used, expired or of another purpose. */
  private async consumeToken(
    client: pg.PoolClient,
    token: string,
    purpose: Purpose,
  ): Promise<{ user_id: string; email: string } | undefined> {
    const result = await client.query<{ user_id: string; email: string }>(
      `UPDATE auth_action_tokens SET used_at = now()
        WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
        RETURNING user_id, email`,
      [hashToken(token), purpose],
    );
    return result.rows[0];
  }

  private link(path: string, token: string): string {
    return `${this.config.mail.linkBaseUrl}/${path}?token=${encodeURIComponent(token)}`;
  }

  /**
   * Sends in the background: the response does not wait for SMTP, so response time cannot reveal
   * whether an email was sent (and therefore whether an account exists).
   */
  private deliver(message: MailMessage): void {
    this.mailer.send(message).catch((error: unknown) => {
      this.logger.error(`Email delivery failed (${message.subject}): ${(error as Error).message}`);
    });
  }
}

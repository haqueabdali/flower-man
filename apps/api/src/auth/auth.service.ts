import type { AuthTokensResponse, LoginRequest, RegisterRequest } from '@flower-man/contracts';
import { ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import pg from 'pg';

import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { PG_POOL } from '../database/database.module.js';
import { withTransaction } from '../database/transaction.js';
import { loadAuthUser } from './auth-users.js';
import { getDummyPasswordHash, hashPassword, verifyPassword } from './password.js';
import { createAccessToken, generateRefreshToken, hashToken } from './tokens.js';

export interface RequestMeta {
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface AuthContext {
  readonly userId: string;
  readonly sessionId: string;
}

type SecurityEventType =
  | 'REGISTERED'
  | 'LOGIN_SUCCEEDED'
  | 'LOGIN_FAILED'
  | 'LOGIN_BLOCKED_ACCOUNT_STATUS'
  | 'TOKEN_REFRESHED'
  | 'REFRESH_TOKEN_REUSED'
  | 'LOGGED_OUT';

const INVALID_CREDENTIALS = 'Invalid email or password.';
const INVALID_REFRESH = 'Session expired. Please sign in again.';

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

@Injectable()
export class AuthService {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Customer self-registration: creates the user with the CUSTOMER capability and signs them in. */
  async register(input: RegisterRequest, meta: RequestMeta): Promise<AuthTokensResponse> {
    const passwordHash = await hashPassword(input.password);
    const created = await withTransaction(this.pool, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (email, email_normalized, full_name, phone)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email_normalized) DO NOTHING
         RETURNING id`,
        [input.email.trim(), normalizeEmail(input.email), input.fullName, input.phone ?? null],
      );
      const userId = inserted.rows[0]?.id;
      if (!userId) {
        return undefined;
      }
      await client.query('INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)', [userId, passwordHash]);
      await client.query(`INSERT INTO user_capabilities (user_id, capability) VALUES ($1, 'CUSTOMER')`, [userId]);
      const tokens = await this.startSession(client, userId, meta);
      await this.recordEvent(client, 'REGISTERED', userId, tokens.sessionId, meta);
      return tokens.response;
    });
    if (!created) {
      throw new ConflictException('An account with this email already exists. Sign in instead.');
    }
    return created;
  }

  async login(input: LoginRequest, meta: RequestMeta): Promise<AuthTokensResponse> {
    const result = await this.pool.query<{ id: string; status: string; password_hash: string }>(
      `SELECT u.id, u.status, c.password_hash
         FROM users u JOIN user_credentials c ON c.user_id = u.id
        WHERE u.email_normalized = $1`,
      [normalizeEmail(input.email)],
    );
    const account = result.rows[0];

    if (!account) {
      await verifyPassword(input.password, await getDummyPasswordHash());
      await this.recordEvent(this.pool, 'LOGIN_FAILED', null, null, meta, { reason: 'UNKNOWN_EMAIL' });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!(await verifyPassword(input.password, account.password_hash))) {
      await this.recordEvent(this.pool, 'LOGIN_FAILED', account.id, null, meta, { reason: 'WRONG_PASSWORD' });
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (account.status !== 'ACTIVE') {
      await this.recordEvent(this.pool, 'LOGIN_BLOCKED_ACCOUNT_STATUS', account.id, null, meta, { status: account.status });
      if (account.status === 'SUSPENDED') {
        throw new ForbiddenException('This account is suspended. Contact Flower Man support.');
      }
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    return withTransaction(this.pool, async (client) => {
      const tokens = await this.startSession(client, account.id, meta);
      await this.recordEvent(client, 'LOGIN_SUCCEEDED', account.id, tokens.sessionId, meta);
      return tokens.response;
    });
  }

  /**
   * Exchanges a refresh token for a new pair. Each refresh token works once: presenting a used one
   * means it was copied, so the whole session is revoked (the legitimate device must sign in again).
   */
  async refresh(refreshToken: string, meta: RequestMeta): Promise<AuthTokensResponse> {
    const outcome = await withTransaction(this.pool, async (client) => {
      const found = await client.query<{
        used_at: Date | null;
        session_id: string;
        user_id: string;
        revoked_at: Date | null;
        expires_at: Date;
        status: string;
      }>(
        `SELECT t.used_at, s.id AS session_id, s.user_id, s.revoked_at, s.expires_at, u.status
           FROM auth_refresh_tokens t
           JOIN auth_sessions s ON s.id = t.session_id
           JOIN users u ON u.id = s.user_id
          WHERE t.token_hash = $1
          FOR UPDATE OF t, s`,
        [hashToken(refreshToken)],
      );
      const row = found.rows[0];
      if (!row) {
        return { ok: false as const };
      }
      if (row.used_at !== null) {
        if (row.revoked_at === null) {
          await client.query(
            `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'REFRESH_TOKEN_REUSE' WHERE id = $1`,
            [row.session_id],
          );
        }
        await this.recordEvent(client, 'REFRESH_TOKEN_REUSED', row.user_id, row.session_id, meta);
        return { ok: false as const };
      }
      if (row.revoked_at !== null || row.expires_at <= new Date() || row.status !== 'ACTIVE') {
        return { ok: false as const };
      }

      await client.query('UPDATE auth_refresh_tokens SET used_at = now() WHERE token_hash = $1', [hashToken(refreshToken)]);
      await client.query('UPDATE auth_sessions SET last_used_at = now() WHERE id = $1', [row.session_id]);
      const response = await this.issueTokens(client, row.user_id, row.session_id, row.expires_at);
      await this.recordEvent(client, 'TOKEN_REFRESHED', row.user_id, row.session_id, meta);
      return { ok: true as const, response };
    });
    if (!outcome.ok) {
      throw new UnauthorizedException(INVALID_REFRESH);
    }
    return outcome.response;
  }

  async logout(auth: AuthContext, meta: RequestMeta): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'LOGOUT' WHERE id = $1 AND revoked_at IS NULL`,
        [auth.sessionId],
      );
      await client.query('UPDATE auth_refresh_tokens SET used_at = now() WHERE session_id = $1 AND used_at IS NULL', [
        auth.sessionId,
      ]);
      await this.recordEvent(client, 'LOGGED_OUT', auth.userId, auth.sessionId, meta);
    });
  }

  private async startSession(
    client: pg.PoolClient,
    userId: string,
    meta: RequestMeta,
  ): Promise<{ sessionId: string; response: AuthTokensResponse }> {
    const session = await client.query<{ id: string; expires_at: Date }>(
      `INSERT INTO auth_sessions (user_id, expires_at, user_agent, ip)
       VALUES ($1, now() + make_interval(days => $2), $3, $4)
       RETURNING id, expires_at`,
      [userId, this.config.auth.sessionTtlDays, meta.userAgent, meta.ip],
    );
    const row = session.rows[0];
    if (!row) {
      throw new Error('Session insert returned no row');
    }
    return { sessionId: row.id, response: await this.issueTokens(client, userId, row.id, row.expires_at) };
  }

  private async issueTokens(
    client: pg.PoolClient,
    userId: string,
    sessionId: string,
    sessionExpiresAt: Date,
  ): Promise<AuthTokensResponse> {
    const refreshToken = generateRefreshToken();
    await client.query('INSERT INTO auth_refresh_tokens (token_hash, session_id) VALUES ($1, $2)', [
      hashToken(refreshToken),
      sessionId,
    ]);
    const access = await createAccessToken(
      { userId, sessionId },
      this.config.auth.accessTokenSecret,
      this.config.auth.accessTokenTtlSeconds,
    );
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: sessionExpiresAt.toISOString(),
      user: await loadAuthUser(client, userId),
    };
  }

  private async recordEvent(
    db: pg.ClientBase | pg.Pool,
    type: SecurityEventType,
    userId: string | null,
    sessionId: string | null,
    meta: RequestMeta,
    details: Record<string, string> = {},
  ): Promise<void> {
    await db.query(
      `INSERT INTO security_events (type, user_id, session_id, ip, user_agent, details) VALUES ($1, $2, $3, $4, $5, $6)`,
      [type, userId, sessionId, meta.ip, meta.userAgent, JSON.stringify(details)],
    );
  }
}

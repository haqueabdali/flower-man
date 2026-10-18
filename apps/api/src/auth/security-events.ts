import type pg from 'pg';

export type SecurityEventType =
  | 'REGISTERED'
  | 'LOGIN_SUCCEEDED'
  | 'LOGIN_FAILED'
  | 'LOGIN_BLOCKED_ACCOUNT_STATUS'
  | 'TOKEN_REFRESHED'
  | 'REFRESH_TOKEN_REUSED'
  | 'LOGGED_OUT'
  | 'EMAIL_VERIFICATION_SENT'
  | 'EMAIL_VERIFIED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED';

export interface RequestMeta {
  readonly ip: string | null;
  readonly userAgent: string | null;
}

/** Appends to the security_events audit log. Never pass passwords or tokens in `details`. */
export async function recordSecurityEvent(
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

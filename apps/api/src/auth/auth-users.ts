import type { AuthUser, Capability } from '@flower-man/contracts';
import type pg from 'pg';

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  email_verified_at: Date | null;
  capabilities: Capability[];
}

const USER_COLUMNS = `
  u.id, u.email, u.full_name, u.phone, u.email_verified_at,
  COALESCE(
    (SELECT array_agg(c.capability ORDER BY c.capability) FROM user_capabilities c WHERE c.user_id = u.id),
    '{}'
  ) AS capabilities`;

export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    emailVerified: row.email_verified_at !== null,
    capabilities: row.capabilities,
  };
}

export async function loadAuthUser(db: pg.ClientBase | pg.Pool, userId: string): Promise<AuthUser> {
  const result = await db.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`, [userId]);
  const row = result.rows[0];
  if (!row) {
    throw new Error(`User ${userId} not found`);
  }
  return toAuthUser(row);
}

export interface SessionUserRow extends UserRow {
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  revoked_at: Date | null;
  expires_at: Date;
}

/** One query per authenticated request: session state + user status + capabilities. */
export async function loadSessionUser(db: pg.Pool, sessionId: string, userId: string): Promise<SessionUserRow | undefined> {
  const result = await db.query<SessionUserRow>(
    `SELECT ${USER_COLUMNS}, u.status, s.revoked_at, s.expires_at
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.user_id = $2`,
    [sessionId, userId],
  );
  return result.rows[0];
}

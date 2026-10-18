// Creates (or promotes) the initial Platform Owner. Idempotent: safe to run on every deploy.
//   PLATFORM_OWNER_EMAIL, PLATFORM_OWNER_PASSWORD, PLATFORM_OWNER_NAME (+ DATABASE_URL, DATABASE_SSL)
//   PLATFORM_OWNER_RESET_PASSWORD=true replaces the password of an existing account.
import { registerRequestSchema } from '@flower-man/contracts';
import pg from 'pg';

import { hashPassword } from '../auth/password.js';
import { ConfigError } from '../config/config-error.js';
import { loadDatabaseConfig } from '../config/database-config.js';

async function main(): Promise<void> {
  const database = loadDatabaseConfig(process.env);
  const parsed = registerRequestSchema.safeParse({
    email: process.env.PLATFORM_OWNER_EMAIL ?? '',
    password: process.env.PLATFORM_OWNER_PASSWORD ?? '',
    fullName: process.env.PLATFORM_OWNER_NAME ?? 'Platform Owner',
  });
  if (!parsed.success) {
    throw new ConfigError(
      `Set PLATFORM_OWNER_EMAIL and PLATFORM_OWNER_PASSWORD (min 10 characters): ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  }
  const { email, password, fullName } = parsed.data;
  const resetPassword = process.env.PLATFORM_OWNER_RESET_PASSWORD?.trim().toLowerCase() === 'true';
  if (process.env.NODE_ENV === 'production' && /change|example|password/i.test(password)) {
    throw new ConfigError('PLATFORM_OWNER_PASSWORD looks like a placeholder. Use a strong unique password.');
  }

  const client = new pg.Client({ connectionString: database.connectionString, ssl: database.ssl, application_name: 'flower-man-bootstrap' });
  await client.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: string }>('SELECT id FROM users WHERE email_normalized = $1 FOR UPDATE', [email.toLowerCase()]);
    let userId = existing.rows[0]?.id;
    let action: string;
    if (!userId) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (email, email_normalized, full_name, email_verified_at) VALUES ($1, $2, $3, now()) RETURNING id`,
        [email, email.toLowerCase(), fullName],
      );
      userId = inserted.rows[0]?.id as string;
      await client.query('INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)', [userId, await hashPassword(password)]);
      action = 'created';
    } else {
      await client.query(`UPDATE users SET status = 'ACTIVE', email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1`, [userId]);
      if (resetPassword) {
        await client.query(
          `INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, password_changed_at = now()`,
          [userId, await hashPassword(password)],
        );
        await client.query(`UPDATE auth_sessions SET revoked_at = now(), revoke_reason = 'PASSWORD_CHANGED' WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
      }
      action = resetPassword ? 'updated (password reset)' : 'already existed (password unchanged)';
    }
    for (const capability of ['PLATFORM_OWNER', 'PLATFORM_ADMIN']) {
      await client.query('INSERT INTO user_capabilities (user_id, capability) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, capability]);
    }
    await client.query(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, details) VALUES (NULL, 'PLATFORM_OWNER_BOOTSTRAP', 'user', $1, $2)`,
      [userId, JSON.stringify({ result: action })],
    );
    await client.query('COMMIT');
    console.log(`Platform Owner ${email}: ${action}.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? `✖ ${error.message}` : error);
  process.exitCode = 1;
});

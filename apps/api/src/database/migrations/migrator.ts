import type pg from 'pg';

import { MigrationError } from './migration-error.js';
import type { MigrationFile } from './migration-files.js';

export interface AppliedMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: string;
  readonly appliedAt: Date;
  readonly executionMs: number;
}

export interface MigrationPlan {
  readonly applied: readonly AppliedMigration[];
  readonly pending: readonly MigrationFile[];
}

export interface MigrationLogger {
  info(message: string): void;
}

/** Arbitrary constant: the session advisory lock that serializes concurrent migration runs. */
export const MIGRATION_LOCK_KEY = '4721093846150237';

/** How long to wait for the migration lock or for a table lock before failing. */
const LOCK_TIMEOUT = '30s';

const HISTORY_TABLE = 'public.schema_migrations';

const CREATE_HISTORY_TABLE = `
CREATE TABLE IF NOT EXISTS ${HISTORY_TABLE} (
  version      integer     PRIMARY KEY CHECK (version > 0),
  name         text        NOT NULL,
  checksum     text        NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  applied_at   timestamptz NOT NULL DEFAULT now(),
  execution_ms integer     NOT NULL CHECK (execution_ms >= 0),
  applied_by   text        NOT NULL DEFAULT current_user
)`;

const pad = (version: number): string => String(version).padStart(4, '0');

/**
 * Compares migration files with the history table. Pure: no database access.
 *
 * Fails when history and files disagree, because applied migrations are immutable:
 * an edited, renamed or deleted applied migration means the database and the
 * repository no longer describe the same schema. Fix it with a NEW migration.
 */
export function planMigrations(
  files: readonly MigrationFile[],
  applied: readonly AppliedMigration[],
): MigrationPlan {
  const filesByVersion = new Map(files.map((file) => [file.version, file]));

  for (const row of applied) {
    const file = filesByVersion.get(row.version);
    if (!file) {
      throw new MigrationError(
        `Migration ${pad(row.version)}_${row.name} is applied in the database but its file is missing.`,
      );
    }
    if (file.name !== row.name) {
      throw new MigrationError(
        `Migration ${pad(row.version)} was applied as "${row.name}" but the file is now ${file.filename}. Applied migrations must not be renamed.`,
      );
    }
    if (file.checksum !== row.checksum) {
      throw new MigrationError(
        `Migration ${file.filename} was modified after it was applied (checksum mismatch). ` +
          'Never edit an applied migration: restore the original file and create a new migration instead.',
      );
    }
  }

  const appliedVersions = new Set(applied.map((row) => row.version));
  const lastApplied = applied.reduce((max, row) => Math.max(max, row.version), 0);
  const pending = files.filter((file) => !appliedVersions.has(file.version));

  const outOfOrder = pending.find((file) => file.version < lastApplied);
  if (outOfOrder) {
    throw new MigrationError(
      `Migration ${outOfOrder.filename} is older than the latest applied migration ${pad(lastApplied)}. Renumber it after ${pad(lastApplied)}.`,
    );
  }

  return { applied, pending };
}

interface HistoryRow {
  version: number;
  name: string;
  checksum: string;
  applied_at: Date;
  execution_ms: number;
}

async function readHistory(client: pg.ClientBase): Promise<AppliedMigration[]> {
  const exists = await client.query<{ exists: boolean }>(
    `SELECT to_regclass('${HISTORY_TABLE}') IS NOT NULL AS exists`,
  );
  if (!exists.rows[0]?.exists) {
    return [];
  }
  const result = await client.query<HistoryRow>(
    `SELECT version, name, checksum, applied_at, execution_ms FROM ${HISTORY_TABLE} ORDER BY version`,
  );
  return result.rows.map((row) => ({
    version: row.version,
    name: row.name,
    checksum: row.checksum,
    appliedAt: row.applied_at,
    executionMs: row.execution_ms,
  }));
}

/** Read-only: compares files with the database without taking the lock or changing anything. */
export async function getMigrationStatus(
  client: pg.ClientBase,
  files: readonly MigrationFile[],
): Promise<MigrationPlan> {
  return planMigrations(files, await readHistory(client));
}

/**
 * Converts a PostgreSQL error position (1-based, counted in characters/code points)
 * to a line number in the migration.
 */
export function errorLine(sql: string, position: string | undefined): number | undefined {
  const offset = Number(position);
  if (!Number.isInteger(offset) || offset < 1) {
    return undefined;
  }
  return Array.from(sql).slice(0, offset - 1).join('').split('\n').length;
}

const describePgError = (error: unknown): string => {
  const pgError = error as Partial<pg.DatabaseError> & Error;
  return `${pgError.message}${pgError.code ? ` (SQLSTATE ${pgError.code})` : ''}`;
};

async function currentTransactionId(client: pg.ClientBase): Promise<string | undefined> {
  const result = await client.query<{ id: string }>('SELECT pg_current_xact_id()::text AS id');
  return result.rows[0]?.id;
}

async function applyOne(client: pg.ClientBase, file: MigrationFile): Promise<number> {
  const started = performance.now();
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL lock_timeout = '${LOCK_TIMEOUT}'`);
    const transactionId = await currentTransactionId(client);

    try {
      await client.query(file.sql);
    } catch (error) {
      const line = errorLine(file.sql, (error as Partial<pg.DatabaseError>).position);
      throw new MigrationError(
        `Migration ${file.filename} failed${line === undefined ? '' : ` at line ${line}`}: ${describePgError(error)}`,
      );
    }

    // The static check cannot see every form (bare END;, COMMIT AND CHAIN, ...): verify the
    // migration is still inside the runner's transaction before recording it as applied.
    if ((await currentTransactionId(client)) !== transactionId) {
      throw new MigrationError(
        `Migration ${file.filename} ended the runner's transaction (COMMIT / END / ROLLBACK / ABORT). ` +
          'Part of it may already be committed. It was NOT recorded as applied. Remove transaction-control statements.',
      );
    }

    const executionMs = Math.round(performance.now() - started);
    try {
      await client.query(
        `INSERT INTO ${HISTORY_TABLE} (version, name, checksum, execution_ms) VALUES ($1, $2, $3, $4)`,
        [file.version, file.name, file.checksum, executionMs],
      );
      await client.query('COMMIT');
    } catch (error) {
      throw new MigrationError(`Migration ${file.filename} failed at COMMIT: ${describePgError(error)}`);
    }
    return executionMs;
  } catch (error) {
    // Keep the original error: a failed ROLLBACK (e.g. lost connection) must not replace it.
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

/**
 * Applies all pending migrations in order, each in its own transaction together with its
 * history row. A session advisory lock serializes concurrent runners (e.g. several deploys).
 * Safe to run repeatedly: already-applied migrations are verified, never re-run.
 */
export async function migrate(
  client: pg.ClientBase,
  files: readonly MigrationFile[],
  logger: MigrationLogger,
): Promise<readonly MigrationFile[]> {
  await client.query(`SET lock_timeout = '${LOCK_TIMEOUT}'`);
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  } catch (error) {
    throw new MigrationError(
      `Could not acquire the migration lock within ${LOCK_TIMEOUT}: another migration run is in progress (${(error as Error).message}).`,
    );
  }

  try {
    await client.query(CREATE_HISTORY_TABLE);
    const { pending } = planMigrations(files, await readHistory(client));

    if (pending.length === 0) {
      logger.info('Database is up to date. No pending migrations.');
      return [];
    }

    for (const file of pending) {
      // Undo session-level SET / SET ROLE from the previous migration, so one run and several
      // runs produce the same schema. (DISCARD ALL is not used: it would release the lock.)
      await client.query('RESET ALL');
      await client.query('RESET ROLE');
      logger.info(`Applying ${file.filename} ...`);
      const executionMs = await applyOne(client, file);
      logger.info(`Applied  ${file.filename} (${executionMs} ms)`);
    }
    return pending;
  } finally {
    // The lock is also released when the session ends, so a failed unlock is not fatal.
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
  }
}

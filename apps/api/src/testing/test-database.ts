// Test helper (not part of the build): a throwaway database with all repository migrations applied.
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

import pg from 'pg';

import type { DatabaseConfig } from '../config/database-config.js';
import { readMigrationFiles } from '../database/migrations/migration-files.js';
import { migrate } from '../database/migrations/migrator.js';

// dist-test/testing/ → repository root is four levels up.
const REPOSITORY_MIGRATIONS = resolve(import.meta.dirname, '../../../../infra/database/migrations');

export interface TestDatabase {
  readonly config: DatabaseConfig;
  drop(): Promise<void>;
}

export async function createTestDatabase(server: DatabaseConfig): Promise<TestDatabase> {
  const name = `flower_man_it_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: server.connectionString, ssl: server.ssl, connectionTimeoutMillis: 10_000 });
  await admin.connect();
  try {
    await admin.query(
      `CREATE DATABASE ${name} TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8'`,
    );
  } finally {
    await admin.end();
  }

  const url = new URL(server.connectionString);
  url.pathname = `/${name}`;
  const config: DatabaseConfig = { connectionString: url.toString(), ssl: server.ssl, description: `test/${name}` };

  const client = new pg.Client({ connectionString: config.connectionString, ssl: config.ssl });
  await client.connect();
  try {
    await migrate(client, await readMigrationFiles(REPOSITORY_MIGRATIONS), { info: () => undefined });
  } finally {
    await client.end();
  }

  return {
    config,
    async drop() {
      const dropper = new pg.Client({ connectionString: server.connectionString, ssl: server.ssl });
      await dropper.connect();
      try {
        await dropper.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await dropper.end();
      }
    },
  };
}

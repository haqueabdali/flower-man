// Integration tests against a real PostgreSQL server (pnpm db:up, then pnpm test:integration).
// Every test creates its own throwaway database and drops it afterwards:
// the development database named in DATABASE_URL is never modified.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import pg from 'pg';

import { type DatabaseConfig, loadDatabaseConfig } from '../../config/database-config.js';
import { MigrationError } from './migration-error.js';
import { readMigrationFiles } from './migration-files.js';
import { getMigrationStatus, migrate } from './migrator.js';

const config: DatabaseConfig = loadDatabaseConfig(process.env);
const REPOSITORY_MIGRATIONS = resolve(process.cwd(), '../../infra/database/migrations');
const silent = { info: (): void => undefined };

function connect(database?: string): pg.Client {
  const url = new URL(config.connectionString);
  if (database) {
    url.pathname = `/${database}`;
  }
  return new pg.Client({ connectionString: url.toString(), ssl: config.ssl, application_name: 'flower-man-test' });
}

/** Creates a throwaway database configured like production (UTF8, builtin C.UTF-8), runs `body`, drops it. */
async function withDatabase(body: (database: string) => Promise<void>): Promise<void> {
  const database = `flower_man_it_${randomBytes(6).toString('hex')}`;
  const admin = connect();
  await admin.connect();
  try {
    await admin.query(
      `CREATE DATABASE ${database} TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8'`,
    );
    try {
      await body(database);
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    }
  } finally {
    await admin.end();
  }
}

async function withClient<T>(database: string, body: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = connect(database);
  await client.connect();
  try {
    return await body(client);
  } finally {
    await client.end();
  }
}

async function withMigrationDir(files: Record<string, string>, body: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'flower-man-it-'));
  try {
    for (const [name, sql] of Object.entries(files)) {
      await writeFile(join(dir, name), sql);
    }
    await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function tableExists(client: pg.Client, table: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>('SELECT to_regclass($1) IS NOT NULL AS exists', [table]);
  return result.rows[0]?.exists === true;
}

async function historyVersions(client: pg.Client): Promise<number[]> {
  const result = await client.query<{ version: number }>('SELECT version FROM public.schema_migrations ORDER BY version');
  return result.rows.map((row) => row.version);
}

describe('migrator (PostgreSQL)', () => {
  it('applies the repository migrations to a clean database, then is a no-op', async () => {
    const files = await readMigrationFiles(REPOSITORY_MIGRATIONS);
    await withDatabase((database) =>
      withClient(database, async (client) => {
        const applied = await migrate(client, files, silent);
        assert.equal(applied.length, files.length);

        const postgis = await client.query<{ version: string }>('SELECT postgis_lib_version() AS version');
        assert.match(postgis.rows[0]?.version ?? '', /^3\./);

        const history = await client.query<{ version: number; checksum: string; applied_by: string }>(
          'SELECT version, checksum, applied_by FROM public.schema_migrations ORDER BY version',
        );
        assert.deepEqual(
          history.rows.map((row) => [row.version, row.checksum]),
          files.map((file) => [file.version, file.checksum]),
        );

        assert.equal((await migrate(client, files, silent)).length, 0);
        assert.equal((await getMigrationStatus(client, files)).pending.length, 0);
      }),
    );
  });

  it('rolls back a failing migration completely and stops', async () => {
    await withMigrationDir(
      {
        '0001_first.sql': 'CREATE TABLE first_table (id int);\n',
        '0002_broken.sql': 'CREATE TABLE second_table (id int);\nINSERT INTO second_table VALUES (1);\nSELECT 1 / 0;\n',
        '0003_never.sql': 'CREATE TABLE third_table (id int);\n',
      },
      async (dir) => {
        const files = await readMigrationFiles(dir);
        await withDatabase((database) =>
          withClient(database, async (client) => {
            await assert.rejects(migrate(client, files, silent), (error: unknown) => {
              assert.ok(error instanceof MigrationError);
              assert.match(error.message, /0002_broken\.sql failed: division by zero \(SQLSTATE 22012\)/);
              return true;
            });
            assert.equal(await tableExists(client, 'first_table'), true);
            assert.equal(await tableExists(client, 'second_table'), false);
            assert.equal(await tableExists(client, 'third_table'), false);
            assert.deepEqual(await historyVersions(client), [1]);
          }),
        );
      },
    );
  });

  it('reports the line of a syntax error', async () => {
    await withMigrationDir(
      { '0001_typo.sql': '-- comment\nCREATE TABLE ok_table (id int);\nSELEC 1;\n' },
      async (dir) => {
        const files = await readMigrationFiles(dir);
        await withDatabase((database) =>
          withClient(database, async (client) => {
            await assert.rejects(
              migrate(client, files, silent),
              /0001_typo\.sql failed at line 3: syntax error at or near "SELEC" \(SQLSTATE 42601\)/,
            );
            assert.equal(await tableExists(client, 'ok_table'), false);
            assert.deepEqual(await historyVersions(client), []);
          }),
        );
      },
    );
  });

  it('refuses to run when an applied migration was edited', async () => {
    await withMigrationDir({ '0001_first.sql': 'CREATE TABLE first_table (id int);\n' }, async (dir) => {
      await withDatabase((database) =>
        withClient(database, async (client) => {
          await migrate(client, await readMigrationFiles(dir), silent);

          await writeFile(join(dir, '0001_first.sql'), 'CREATE TABLE first_table (id bigint);\n');
          await writeFile(join(dir, '0002_second.sql'), 'CREATE TABLE second_table (id int);\n');

          await assert.rejects(migrate(client, await readMigrationFiles(dir), silent), /modified after it was applied/);
          assert.equal(await tableExists(client, 'second_table'), false);
          assert.deepEqual(await historyVersions(client), [1]);
        }),
      );
    });
  });

  it('serializes concurrent runs: each migration is applied exactly once', async () => {
    await withMigrationDir(
      {
        '0001_slow.sql': 'SELECT pg_sleep(0.5);\nCREATE TABLE slow_table (id int);\n',
        '0002_next.sql': 'CREATE TABLE next_table (id int);\n',
      },
      async (dir) => {
        const files = await readMigrationFiles(dir);
        await withDatabase(async (database) => {
          const results = await Promise.all([
            withClient(database, (client) => migrate(client, files, silent)),
            withClient(database, (client) => migrate(client, files, silent)),
            withClient(database, (client) => migrate(client, files, silent)),
          ]);
          const appliedCounts = results.map((applied) => applied.length).sort();
          assert.deepEqual(appliedCounts, [0, 0, 2]);
          await withClient(database, async (client) => {
            assert.deepEqual(await historyVersions(client), [1, 2]);
          });
        });
      },
    );
  });
});

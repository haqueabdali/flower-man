// Migration CLI.
//   node dist/database/migrate.js up     --dir <migrations-dir>   apply pending migrations
//   node dist/database/migrate.js status --dir <migrations-dir>   show applied / pending
// Reads DATABASE_URL and DATABASE_SSL from the environment (see .env.example).
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import pg from 'pg';

import { ConfigError } from '../config/config-error.js';
import { loadDatabaseConfig } from '../config/database-config.js';
import { MigrationError } from './migrations/migration-error.js';
import { readMigrationFiles } from './migrations/migration-files.js';
import { getMigrationStatus, migrate } from './migrations/migrator.js';

const COMMANDS = ['up', 'status'] as const;
type Command = (typeof COMMANDS)[number];

const isCommand = (value: string | undefined): value is Command =>
  COMMANDS.some((command) => command === value);

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { dir: { type: 'string' } },
  });

  const command = positionals[0];
  if (!isCommand(command) || positionals.length > 1) {
    throw new ConfigError(`Usage: migrate <${COMMANDS.join('|')}> --dir <migrations-dir>`);
  }
  if (!values.dir) {
    throw new ConfigError('Missing --dir <migrations-dir>.');
  }

  const directory = resolve(values.dir);
  const files = await readMigrationFiles(directory);
  const config = loadDatabaseConfig(process.env);

  const client = new pg.Client({
    connectionString: config.connectionString,
    ssl: config.ssl,
    application_name: 'flower-man-migrate',
    connectionTimeoutMillis: 10_000,
  });
  // A dropped connection also rejects the pending query, which the catch below reports.
  // Without a listener, pg's 'error' event would crash the process and hide the reason.
  client.on('error', () => undefined);

  // Print the target pg actually resolved (URL parameters and PG* variables can change it).
  const target = `${client.host}:${client.port}/${client.database ?? ''}`;
  console.log(`Database:   ${target} (TLS ${config.ssl ? 'on' : 'off'})`);
  console.log(`Migrations: ${directory} (${files.length} files)`);

  try {
    await client.connect();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new MigrationError(
      `Cannot connect to ${target}: ${(error as Error).message}${code ? ` (${code})` : ''}. ` +
        'Is the database running? Try: pnpm db:up',
    );
  }

  try {
    if (command === 'up') {
      const applied = await migrate(client, files, { info: (message) => console.log(message) });
      console.log(`Done. ${applied.length} migration(s) applied.`);
    } else {
      const plan = await getMigrationStatus(client, files);
      for (const row of plan.applied) {
        console.log(
          `  applied  ${String(row.version).padStart(4, '0')}_${row.name}  ${row.appliedAt.toISOString()}  ${row.executionMs} ms`,
        );
      }
      for (const file of plan.pending) {
        console.log(`  pending  ${file.filename}`);
      }
      console.log(`${plan.applied.length} applied, ${plan.pending.length} pending.`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError || error instanceof MigrationError) {
    console.error(`✖ ${error.message}`);
  } else {
    console.error('✖ Unexpected error while running migrations:');
    console.error(error);
  }
  process.exitCode = 1;
});

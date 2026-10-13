import { type DynamicModule, Global, Inject, Injectable, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import pg from 'pg';

import type { DatabaseConfig } from '../config/database-config.js';

/** Injection token for the shared pg.Pool: @Inject(PG_POOL) pool: pg.Pool */
export const PG_POOL = Symbol('PG_POOL');

const logger = new Logger('Database');

export function createPool(config: DatabaseConfig): pg.Pool {
  const pool = new pg.Pool({
    connectionString: config.connectionString,
    ssl: config.ssl,
    application_name: 'flower-man-api',
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // Server-side limits: a runaway query or a leaked transaction cannot hold resources forever.
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 60_000,
    // Client-side limit: the API never waits forever on an unresponsive server.
    query_timeout: 20_000,
  });
  // Without a listener, an error on an idle client (e.g. the server restarts) would crash the process.
  pool.on('error', (error) => logger.error(`Idle database client error: ${error.message}`));
  return pool;
}

@Injectable()
class PoolShutdown implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(config: DatabaseConfig): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [{ provide: PG_POOL, useFactory: () => createPool(config) }, PoolShutdown],
      exports: [PG_POOL],
    };
  }
}

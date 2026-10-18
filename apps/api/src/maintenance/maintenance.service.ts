import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import pg from 'pg';

import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { PG_POOL } from '../database/database.module.js';
import { CommerceService } from '../orders/commerce.service.js';

/** GPS points of finished deliveries are kept this long, then deleted (data minimisation). */
const LOCATION_RETENTION_DAYS = 30;

/** Periodic housekeeping. Safe to run on several instances at once (every step is idempotent). */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Maintenance');
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly commerce: CommerceService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.nodeEnv === 'test') {
      return;
    }
    this.timer = setInterval(() => {
      this.runOnce().catch((error: unknown) => this.logger.error(`Maintenance failed: ${(error as Error).message}`));
    }, 60_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  async runOnce(): Promise<{ expiredOrders: number; expiredRequests: number; purgedLocations: number; purgedRateLimits: number }> {
    const stale = await this.pool.query<{ id: string }>(
      `SELECT id FROM orders WHERE status = 'PENDING_PAYMENT' AND created_at < now() - make_interval(mins => $1) LIMIT 100`,
      [this.config.commerce.unpaidOrderTtlMinutes],
    );
    let expiredOrders = 0;
    for (const order of stale.rows) {
      try {
        await this.commerce.cancel(order.id, 'SYSTEM', null, 'Payment not completed in time');
        expiredOrders += 1;
      } catch (error) {
        this.logger.warn(`Could not expire order ${order.id}: ${(error as Error).message}`);
      }
    }
    const requests = await this.pool.query(`UPDATE custom_requests SET status = 'EXPIRED' WHERE status = 'OPEN' AND expires_at <= now()`);
    const locations = await this.pool.query(
      `DELETE FROM delivery_locations l USING deliveries d
        WHERE l.delivery_id = d.id AND d.status IN ('DELIVERED', 'CANCELLED')
          AND l.received_at < now() - make_interval(days => $1)`,
      [LOCATION_RETENTION_DAYS],
    );
    const rateLimits = await this.pool.query(`DELETE FROM rate_limit_windows WHERE reset_at < now() - interval '1 minute'`);
    return {
      expiredOrders,
      expiredRequests: requests.rowCount ?? 0,
      purgedLocations: locations.rowCount ?? 0,
      purgedRateLimits: rateLimits.rowCount ?? 0,
    };
  }
}

import type { HealthResponse } from '@flower-man/contracts';
import { Controller, Get, Header, HttpStatus, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import pg from 'pg';

import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { PG_POOL } from '../database/database.module.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Liveness + database reachability. Public, reveals no versions of infrastructure. */
  @Get()
  @Header('Cache-Control', 'no-store')
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    let database: HealthResponse['checks']['database'] = 'ok';
    try {
      await this.pool.query('SELECT 1');
    } catch {
      database = 'down';
    }
    const status = database === 'ok' ? 'ok' : 'down';
    if (status !== 'ok') {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return {
      status,
      service: 'flower-man-api',
      version: this.config.version,
      time: new Date().toISOString(),
      checks: { database },
    };
  }
}

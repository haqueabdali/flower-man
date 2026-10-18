import { Module } from '@nestjs/common';
import type pg from 'pg';

import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { PG_POOL } from '../database/database.module.js';

import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { memoryRateLimiterFactory, postgresRateLimiterFactory, RATE_LIMITER_FACTORY } from './rate-limiter.js';

@Module({
  controllers: [AuthController, AccountController],
  providers: [
    AuthService,
    AccountService,
    AuthGuard,
    {
      provide: RATE_LIMITER_FACTORY,
      inject: [APP_CONFIG, PG_POOL],
      useFactory: (config: AppConfig, pool: pg.Pool) =>
        config.rateLimitStore === 'postgres' ? postgresRateLimiterFactory(pool) : memoryRateLimiterFactory(),
    },
  ],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}

import { type DynamicModule, Module } from '@nestjs/common';

import type { AppConfig } from './config/app-config.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(config), DatabaseModule.forRoot(config.database)],
      controllers: [HealthController],
    };
  }
}

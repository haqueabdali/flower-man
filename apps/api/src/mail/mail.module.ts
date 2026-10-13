import { type DynamicModule, Global, Module } from '@nestjs/common';

import type { MailConfig } from '../config/app-config.js';
import { createMailer, MAILER } from './mailer.js';

@Global()
@Module({})
export class MailModule {
  static forRoot(config: MailConfig): DynamicModule {
    return {
      module: MailModule,
      providers: [{ provide: MAILER, useFactory: () => createMailer(config) }],
      exports: [MAILER],
    };
  }
}

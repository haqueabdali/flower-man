import 'reflect-metadata';

import { API_GLOBAL_PREFIX, API_VERSION, REQUEST_ID_HEADER } from '@flower-man/contracts';
import type { LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { requestContext } from './common/request-context.js';
import type { AppConfig } from './config/app-config.js';

export const API_PREFIX = `${API_GLOBAL_PREFIX}/${API_VERSION}`;

const LOG_LEVELS: Readonly<Record<AppConfig['nodeEnv'], LogLevel[]>> = {
  development: ['log', 'warn', 'error', 'fatal'],
  production: ['log', 'warn', 'error', 'fatal'],
  test: ['warn', 'error', 'fatal'],
};

/** Builds the fully configured API application (used by main.ts and by the integration tests). */
export async function createApp(config: AppConfig): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    bodyParser: false,
    logger: LOG_LEVELS[config.nodeEnv],
  });

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(helmet());
  // Raw bodies where they are needed (registered before the JSON parser, which then skips them):
  // the Stripe webhook signature is computed over the exact bytes; proof photos are binary uploads.
  app.use(`/${API_PREFIX}/payments/stripe/webhook`, express.raw({ type: '*/*', limit: '1mb' }));
  app.use(
    `/${API_PREFIX}/courier/deliveries/:id/proof`,
    express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' }),
  );
  app.useBodyParser('json', { limit: '100kb' });
  app.enableCors({
    // false = no CORS headers at all: browsers on other origins are refused.
    origin: config.corsOrigins.length > 0 ? [...config.corsOrigins] : false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', REQUEST_ID_HEADER, 'X-Seller-Id'],
    exposedHeaders: [REQUEST_ID_HEADER],
    credentials: false,
    maxAge: 600,
  });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();
  return app;
}

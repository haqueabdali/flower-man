// Flower Man API entry point.
import 'reflect-metadata';

import { Logger } from '@nestjs/common';

import { API_PREFIX, createApp } from './app.factory.js';
import { type AppConfig, loadAppConfig } from './config/app-config.js';
import { ConfigError } from './config/config-error.js';

async function main(): Promise<void> {
  let config: AppConfig;
  try {
    config = loadAppConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`✖ Invalid configuration: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const app = await createApp(config);
  await app.listen(config.port, config.host);
  Logger.log(
    `Flower Man API (${config.nodeEnv}) on http://${config.host}:${config.port}/${API_PREFIX}`,
    'Bootstrap',
  );
}

main().catch((error: unknown) => {
  console.error('✖ API failed to start:', error);
  process.exitCode = 1;
});

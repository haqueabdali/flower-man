// Strict production environment validation. Fails unless every real credential/setting is present.
// Usage (Git Bash):  node --env-file=.env.production scripts/production-check.mjs
//   or with variables already exported by the hosting platform:  pnpm release:production-check
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const env = process.env;
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? '✔' : '✖'} ${message}`);
  if (!ok) failures.push(message);
};
const isHttps = (value) => {
  try {
    return new URL(value ?? '').protocol === 'https:';
  } catch {
    return false;
  }
};

// 1. The API's own validation (the exact rules the server applies at startup).
try {
  const { loadAppConfig } = await import(pathToFileURL(resolve('apps/api/dist/config/app-config.js')).href);
  const config = loadAppConfig(env);
  check(true, 'API configuration is valid (loadAppConfig)');
  check(config.nodeEnv === 'production', 'NODE_ENV=production');
  check(config.payments.provider === 'stripe', 'PAYMENT_PROVIDER=stripe');
  check(config.mail.transport === 'smtp', 'MAIL_TRANSPORT=smtp');
  check(config.push.enabled, 'PUSH_ENABLED=true');
  check(config.trustProxy !== false, 'TRUST_PROXY set to the number of proxies in front of the API');
  check(config.corsOrigins.length > 0, 'CORS_ORIGINS lists the admin origin(s)');
  check(config.storage.driver === 's3', 'STORAGE_DRIVER=s3 (S3-compatible object storage, not local disk)');
  check(config.rateLimitStore === 'postgres', 'RATE_LIMIT_STORE=postgres (shared by every API instance)');
  check(config.alertWebhookUrl !== null, 'ALERT_WEBHOOK_URL set (500 errors and failed jobs reach the team)');
} catch (error) {
  check(false, `API configuration: ${error.message}`);
}

// 2. Values the API cannot judge alone.
let databaseHost = '';
try {
  databaseHost = new URL(env.DATABASE_URL ?? '').hostname;
} catch {
  /* reported by loadAppConfig */
}
check(databaseHost !== '' && !['127.0.0.1', 'localhost', '::1'].includes(databaseHost), 'DATABASE_URL points to the production database (not localhost)');
check((env.AUTH_ACCESS_TOKEN_SECRET ?? '').length >= 48, 'AUTH_ACCESS_TOKEN_SECRET has at least 48 characters');
check(/^sk_live_/.test(env.STRIPE_SECRET_KEY ?? '') || /^rk_live_/.test(env.STRIPE_SECRET_KEY ?? ''), 'STRIPE_SECRET_KEY is a live key');
check(/^whsec_/.test(env.STRIPE_WEBHOOK_SECRET ?? ''), 'STRIPE_WEBHOOK_SECRET is set');
check(/^smtps:\/\/[^:]+:[^@]+@/.test(env.SMTP_URL ?? '') || /^smtp:\/\/[^:]+:[^@]+@/.test(env.SMTP_URL ?? ''), 'SMTP_URL includes credentials');
check(/@/.test(env.MAIL_FROM ?? '') && !/localhost/.test(env.MAIL_FROM ?? ''), 'MAIL_FROM is a real sender address');
check(isHttps(env.EMAIL_LINK_BASE_URL), 'EMAIL_LINK_BASE_URL uses https');
check(isHttps(env.ADMIN_API_URL), 'ADMIN_API_URL (admin web → API) uses https');
check(Boolean(env.PLATFORM_OWNER_EMAIL), 'PLATFORM_OWNER_EMAIL is set for the bootstrap');

// 3. Mobile build configuration (EAS build profiles / CI). EAS project IDs live in each app.config.ts (release:check).
check(isHttps(env.EXPO_PUBLIC_API_URL), 'EXPO_PUBLIC_API_URL uses https');
check(/^pk_live_/.test(env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''), 'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is a live publishable key');
check(isHttps(env.EXPO_PUBLIC_PRIVACY_POLICY_URL), 'EXPO_PUBLIC_PRIVACY_POLICY_URL uses https');
check(isHttps(env.EXPO_PUBLIC_TERMS_OF_SERVICE_URL), 'EXPO_PUBLIC_TERMS_OF_SERVICE_URL uses https');

// 4. No debug switches.
check(!env.DEBUG && !env.NODE_OPTIONS?.includes('--inspect'), 'no DEBUG / --inspect flags');

console.log(failures.length === 0 ? '\nProduction environment OK.' : `\n✖ ${failures.length} production requirement(s) missing. Do not deploy.`);
process.exitCode = failures.length === 0 ? 0 : 1;

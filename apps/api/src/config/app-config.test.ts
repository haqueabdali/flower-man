import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EXAMPLE_ACCESS_TOKEN_SECRET, loadAppConfig } from './app-config.js';
import { ConfigError } from './config-error.js';

const BASE: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://flower_man:flower_man@127.0.0.1:55432/flower_man',
  DATABASE_SSL: 'false',
  AUTH_ACCESS_TOKEN_SECRET: EXAMPLE_ACCESS_TOKEN_SECRET,
};

describe('loadAppConfig', () => {
  it('applies development defaults', () => {
    const config = loadAppConfig(BASE);
    assert.equal(config.nodeEnv, 'development');
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.port, 4000);
    assert.deepEqual(config.corsOrigins, []);
    assert.equal(config.trustProxy, false);
    assert.equal(config.version, '0.0.0-dev');
    assert.equal(config.database.description, '127.0.0.1:55432/flower_man');
  });

  it('reads explicit values', () => {
    const config = loadAppConfig({
      ...BASE,
      NODE_ENV: ' Test ',
      HOST: '0.0.0.0',
      PORT: '8080',
      CORS_ORIGINS: 'http://localhost:3000, https://admin.flowerman.example/',
      TRUST_PROXY: '1',
      APP_VERSION: '1.2.3',
    });
    assert.equal(config.nodeEnv, 'test');
    assert.equal(config.host, '0.0.0.0');
    assert.equal(config.port, 8080);
    assert.deepEqual(config.corsOrigins, ['http://localhost:3000', 'https://admin.flowerman.example']);
    assert.equal(config.trustProxy, 1);
    assert.equal(config.version, '1.2.3');
  });

  const S3: NodeJS.ProcessEnv = {
    STORAGE_DRIVER: 's3',
    S3_REGION: 'auto',
    S3_BUCKET: 'flower-man-proofs',
    S3_ACCESS_KEY_ID: 'test-access-key',
    S3_SECRET_ACCESS_KEY: 'test-secret-key',
  };

  it('defaults to local storage and in-memory rate limits outside production', () => {
    const config = loadAppConfig(BASE);
    assert.deepEqual(config.storage, { driver: 'local', localDir: 'storage', s3: null });
    assert.equal(config.rateLimitStore, 'memory');
  });

  it('reads S3-compatible storage settings', () => {
    const config = loadAppConfig({ ...BASE, ...S3, S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com/', RATE_LIMIT_STORE: 'postgres' });
    assert.deepEqual(config.storage.s3, {
      endpoint: 'https://account.r2.cloudflarestorage.com',
      region: 'auto',
      bucket: 'flower-man-proofs',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
    });
    assert.equal(config.rateLimitStore, 'postgres');
  });

  const PRODUCTION: NodeJS.ProcessEnv = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://app:secret@db.example.it:5432/flower_man',
    DATABASE_SSL: 'true',
    AUTH_ACCESS_TOKEN_SECRET: 'p'.repeat(48),
    MAIL_TRANSPORT: 'smtp',
    SMTP_URL: 'smtps://mailer:secret@smtp.example.it:465',
    MAIL_FROM: 'Flower Man <no-reply@example.it>',
    EMAIL_LINK_BASE_URL: 'https://app.example.it',
    PAYMENT_PROVIDER: 'stripe',
    STRIPE_SECRET_KEY: 'sk_live_abc123',
    STRIPE_WEBHOOK_SECRET: 'whsec_abc123',
  };

  it('requires object storage and shares rate limits in production', () => {
    assert.throws(() => loadAppConfig(PRODUCTION), /STORAGE_DRIVER=local is not allowed in production/);
    const config = loadAppConfig({ ...PRODUCTION, ...S3 });
    assert.equal(config.storage.driver, 's3');
    assert.equal(config.storage.s3?.endpoint, null);
    assert.equal(config.rateLimitStore, 'postgres');
    assert.throws(() => loadAppConfig({ ...PRODUCTION, ...S3, S3_ENDPOINT: 'http://minio.internal:9000' }), /S3_ENDPOINT must use https/);
  });

  const invalid: ReadonlyArray<[string, NodeJS.ProcessEnv, RegExp]> = [
    ['unknown NODE_ENV', { NODE_ENV: 'staging' }, /NODE_ENV must be one of/],
    ['non-numeric PORT', { PORT: '80a' }, /PORT must be a whole number/],
    ['PORT out of range', { PORT: '70000' }, /PORT must be a whole number/],
    ['PORT zero', { PORT: '0' }, /PORT must be a whole number/],
    ['wildcard CORS', { CORS_ORIGINS: '*' }, /"\*" is not allowed/],
    ['CORS entry with a path', { CORS_ORIGINS: 'https://admin.example.com/app' }, /origin only/],
    ['CORS entry that is not a URL', { CORS_ORIGINS: 'admin.example.com' }, /not a valid origin/],
    ['CORS entry with another scheme', { CORS_ORIGINS: 'ftp://admin.example.com' }, /http or https/],
    ['http CORS origin in production', { NODE_ENV: 'production', DATABASE_SSL: 'true', CORS_ORIGINS: 'http://admin.example.com' }, /https in production/],
    ['TRUST_PROXY text', { TRUST_PROXY: 'yes' }, /TRUST_PROXY must be a whole number/],
    ['TRUST_PROXY too high', { TRUST_PROXY: '11' }, /TRUST_PROXY must be a whole number/],
    ['missing database settings', { DATABASE_URL: '' }, /DATABASE_URL is not set/],
    ['missing access token secret', { AUTH_ACCESS_TOKEN_SECRET: '' }, /AUTH_ACCESS_TOKEN_SECRET must be set/],
    ['short access token secret', { AUTH_ACCESS_TOKEN_SECRET: 'x'.repeat(31) }, /at least 32/],
    ['unknown STORAGE_DRIVER', { STORAGE_DRIVER: 'ftp' }, /STORAGE_DRIVER must be/],
    ['S3 without bucket', { ...S3, S3_BUCKET: '' }, /S3_BUCKET must be/],
    ['S3 without credentials', { ...S3, S3_SECRET_ACCESS_KEY: '' }, /S3_SECRET_ACCESS_KEY must be set/],
    ['S3 endpoint that is not a URL', { ...S3, S3_ENDPOINT: 'r2.example.com' }, /S3_ENDPOINT must be a URL/],
    ['S3 endpoint with credentials', { ...S3, S3_ENDPOINT: 'https://key:secret@r2.example.com' }, /must not contain credentials/],
    ['unknown RATE_LIMIT_STORE', { RATE_LIMIT_STORE: 'redis' }, /RATE_LIMIT_STORE must be/],
    [
      'example access token secret in production',
      { NODE_ENV: 'production', DATABASE_SSL: 'true' },
      /still has the .env.example value/,
    ],
  ];

  for (const [label, overrides, message] of invalid) {
    it(`rejects ${label}`, () => {
      assert.throws(() => loadAppConfig({ ...BASE, ...overrides }), (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.match(error.message, message);
        return true;
      });
    });
  }
});

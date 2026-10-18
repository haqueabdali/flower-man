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

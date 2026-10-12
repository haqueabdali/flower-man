import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConfigError } from './config-error.js';
import { loadDatabaseConfig } from './database-config.js';

const LOCAL_URL = 'postgresql://flower_man:flower_man@127.0.0.1:55432/flower_man';

describe('loadDatabaseConfig', () => {
  it('accepts the local development configuration', () => {
    const config = loadDatabaseConfig({ DATABASE_URL: LOCAL_URL, DATABASE_SSL: 'false' });
    assert.equal(config.connectionString, LOCAL_URL);
    assert.equal(config.ssl, false);
    assert.equal(config.description, '127.0.0.1:55432/flower_man');
  });

  it('enables verified TLS when DATABASE_SSL=true', () => {
    const config = loadDatabaseConfig({ DATABASE_URL: LOCAL_URL, DATABASE_SSL: 'TRUE' });
    assert.deepEqual(config.ssl, { rejectUnauthorized: true });
  });

  it('defaults the port to 5432 in the description', () => {
    const config = loadDatabaseConfig({ DATABASE_URL: 'postgres://u:p@db.example.com/app', DATABASE_SSL: 'true' });
    assert.equal(config.description, 'db.example.com:5432/app');
  });

  it('never puts credentials in the description', () => {
    const config = loadDatabaseConfig({
      DATABASE_URL: 'postgresql://admin:s3cr3t-value@db.example.com:6543/app',
      DATABASE_SSL: 'true',
    });
    assert.ok(!config.description.includes('s3cr3t-value'));
    assert.ok(!config.description.includes('admin'));
  });

  const invalid: ReadonlyArray<[string, NodeJS.ProcessEnv, RegExp]> = [
    ['missing DATABASE_URL', { DATABASE_SSL: 'false' }, /DATABASE_URL is not set/],
    ['blank DATABASE_URL', { DATABASE_URL: '   ', DATABASE_SSL: 'false' }, /DATABASE_URL is not set/],
    ['malformed URL', { DATABASE_URL: 'not a url', DATABASE_SSL: 'false' }, /not a valid URL/],
    ['wrong protocol', { DATABASE_URL: 'mysql://u:p@h:3306/db', DATABASE_SSL: 'false' }, /postgresql:\/\//],
    ['no database name', { DATABASE_URL: 'postgresql://u:p@h:5432/', DATABASE_SSL: 'false' }, /no database name/],
    ['sslmode in URL', { DATABASE_URL: `${LOCAL_URL}?sslmode=disable`, DATABASE_SSL: 'true' }, /Remove "sslmode"/],
    ['sslrootcert in URL', { DATABASE_URL: `${LOCAL_URL}?sslrootcert=x`, DATABASE_SSL: 'true' }, /Remove "sslrootcert"/],
    ['missing DATABASE_SSL', { DATABASE_URL: LOCAL_URL }, /DATABASE_SSL must be set/],
    ['invalid DATABASE_SSL', { DATABASE_URL: LOCAL_URL, DATABASE_SSL: 'yes' }, /DATABASE_SSL must be set/],
    ['invalid percent-encoding in the database name', { DATABASE_URL: 'postgresql://u:p@h:5432/db%zz', DATABASE_SSL: 'false' }, /invalid percent-encoding/],
    ['invalid percent-encoding in the password', { DATABASE_URL: 'postgresql://u:p%ff@h:5432/db', DATABASE_SSL: 'false' }, /invalid percent-encoding/],
    ...['production', 'Production', ' production ', 'PRODUCTION'].map(
      (nodeEnv): [string, NodeJS.ProcessEnv, RegExp] => [
        `NODE_ENV="${nodeEnv}" without TLS`,
        { DATABASE_URL: LOCAL_URL, DATABASE_SSL: 'false', NODE_ENV: nodeEnv },
        /must be "true" when NODE_ENV=production/,
      ],
    ),
  ];

  for (const [label, env, message] of invalid) {
    it(`rejects ${label}`, () => {
      assert.throws(() => loadDatabaseConfig(env), (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.match(error.message, message);
        return true;
      });
    });
  }

  for (const password of ['/Kq9xS3cr3t', '2024/S3cr3t', 'Xq7@Lm2/Zp9', 'abc?def', 'abc#def']) {
    it(`rejects an unencoded special character in password "${password}" without echoing it`, () => {
      assert.throws(
        () => loadDatabaseConfig({ DATABASE_URL: `postgresql://flower_man:${password}@db.example.com:5432/app`, DATABASE_SSL: 'true' }),
        (error: unknown) => {
          assert.ok(error instanceof ConfigError);
          assert.ok(!error.message.includes(password), error.message);
          return true;
        },
      );
    });
  }

  it('accepts a percent-encoded password', () => {
    const config = loadDatabaseConfig({
      DATABASE_URL: `postgresql://flower_man:${encodeURIComponent('Xq7@Lm2/Zp9?#%')}@db.example.com:5432/app`,
      DATABASE_SSL: 'true',
    });
    assert.equal(config.description, 'db.example.com:5432/app');
  });

  it('does not echo the password in error messages', () => {
    assert.throws(
      () => loadDatabaseConfig({ DATABASE_URL: 'postgresql://u:topsecret@h:5432/db?sslmode=require', DATABASE_SSL: 'true' }),
      (error: unknown) => error instanceof ConfigError && !error.message.includes('topsecret'),
    );
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadAppConfig } from '../config/app-config.js';
import { ConfigError } from '../config/config-error.js';
import { createMailer, LogMailer, MemoryMailer, SmtpMailer } from './mailer.js';

const BASE: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:55432/db',
  DATABASE_SSL: 'false',
  AUTH_ACCESS_TOKEN_SECRET: 'x'.repeat(40),
};

describe('mail configuration', () => {
  it('defaults to the log transport in development', () => {
    const config = loadAppConfig(BASE);
    assert.equal(config.mail.transport, 'log');
    assert.ok(createMailer(config.mail) instanceof LogMailer);
  });

  it('builds an SMTP mailer', () => {
    const config = loadAppConfig({ ...BASE, MAIL_TRANSPORT: 'smtp', SMTP_URL: 'smtp://127.0.0.1:1025' });
    assert.ok(createMailer(config.mail) instanceof SmtpMailer);
  });

  it('allows the memory transport only in tests', () => {
    assert.ok(createMailer(loadAppConfig({ ...BASE, NODE_ENV: 'test', MAIL_TRANSPORT: 'memory' }).mail) instanceof MemoryMailer);
    assert.throws(() => loadAppConfig({ ...BASE, MAIL_TRANSPORT: 'memory' }), ConfigError);
  });

  const invalid: ReadonlyArray<[string, NodeJS.ProcessEnv, RegExp]> = [
    ['an unknown transport', { MAIL_TRANSPORT: 'pigeon' }, /MAIL_TRANSPORT must be/],
    ['smtp without SMTP_URL', { MAIL_TRANSPORT: 'smtp' }, /SMTP_URL is required/],
    ['a non-SMTP URL', { MAIL_TRANSPORT: 'smtp', SMTP_URL: 'http://mail.example.com' }, /smtp:\/\/ or smtps:\/\//],
    [
      'the log transport in production',
      { NODE_ENV: 'production', DATABASE_SSL: 'true', AUTH_ACCESS_TOKEN_SECRET: 'p'.repeat(40) },
      /Use "smtp" in production/,
    ],
    [
      'http email links in production',
      {
        NODE_ENV: 'production',
        DATABASE_SSL: 'true',
        AUTH_ACCESS_TOKEN_SECRET: 'p'.repeat(40),
        MAIL_TRANSPORT: 'smtp',
        SMTP_URL: 'smtps://u:p@smtp.example.com:465',
        EMAIL_LINK_BASE_URL: 'http://app.example.com',
      },
      /https in production/,
    ],
  ];
  for (const [label, env, message] of invalid) {
    it(`rejects ${label}`, () => {
      assert.throws(() => loadAppConfig({ ...BASE, ...env }), (error: unknown) => error instanceof ConfigError && message.test(error.message));
    });
  }
});

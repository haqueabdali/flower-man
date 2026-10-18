// Email verification and password recovery against a throwaway, fully migrated database.
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';

import type { AuthTokensResponse, MeResponse } from '@flower-man/contracts';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';

import { API_PREFIX, createApp } from '../app.factory.js';
import { type AppConfig, loadAppConfig } from '../config/app-config.js';
import { MAILER, type MailMessage, MemoryMailer } from '../mail/mailer.js';
import { createTestDatabase, type TestDatabase } from '../testing/test-database.js';

const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a brand new password 2026';
const uniqueEmail = (label: string) => `${label}.${randomBytes(4).toString('hex')}@example.com`;

let database: TestDatabase;
let app: NestExpressApplication;
let baseUrl: string;
let db: pg.Pool;
let mailbox: MemoryMailer;

async function post(path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function register(email = uniqueEmail('user')): Promise<AuthTokensResponse> {
  const response = await post('/auth/register', { email, password: PASSWORD, fullName: 'Test User' });
  assert.equal(response.status, 201);
  return (await response.json()) as AuthTokensResponse;
}

/** Background delivery: wait until the message for `to` arrives. */
async function nextMail(to: string, subject: RegExp): Promise<MailMessage> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const found = [...mailbox.sent].reverse().find((message) => message.to === to && subject.test(message.subject));
    if (found) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`no email to ${to} matching ${subject}`);
}

function tokenFrom(message: MailMessage, path: string): string {
  const match = new RegExp(`https?://\\S+/${path}\\?token=([A-Za-z0-9_-]+)`).exec(message.text);
  assert.ok(match?.[1], `link /${path} not found in email`);
  return match[1];
}

async function me(accessToken: string): Promise<MeResponse['user']> {
  const response = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  assert.equal(response.status, 200);
  return ((await response.json()) as MeResponse).user;
}

before(async () => {
  const base = loadAppConfig({ ...process.env, NODE_ENV: 'test', MAIL_TRANSPORT: 'memory' });
  database = await createTestDatabase(base.database);
  const config: AppConfig = {
    ...base,
    database: database.config,
    mail: { ...base.mail, linkBaseUrl: 'https://app.flowerman.test' },
    auth: { ...base.auth, rateLimits: { ...base.auth.rateLimits, registerPerIp: { limit: 1_000, windowMs: 60_000 } } },
  };
  app = await createApp(config);
  await app.listen(0, '127.0.0.1');
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/${API_PREFIX}`;
  mailbox = app.get<MemoryMailer>(MAILER);
  db = new pg.Pool({ connectionString: database.config.connectionString, ssl: database.config.ssl });
});

after(async () => {
  await db.end();
  await app.close();
  await database.drop();
});

beforeEach(() => {
  mailbox.sent.length = 0;
});

describe('email verification', () => {
  it('sends a link on registration; confirming it verifies the email once', async () => {
    const email = uniqueEmail('verify');
    const tokens = await register(email);
    assert.equal((await me(tokens.accessToken)).emailVerified, false);

    const mail = await nextMail(email, /conferma|confirm/);
    assert.match(mail.text, /https:\/\/app\.flowerman\.test\/verify-email\?token=/);
    const token = tokenFrom(mail, 'verify-email');

    assert.equal((await post('/auth/email-verification/confirm', { token })).status, 204);
    assert.equal((await me(tokens.accessToken)).emailVerified, true);
    assert.equal((await post('/auth/email-verification/confirm', { token })).status, 400, 'links are single use');
  });

  it('re-sending invalidates the previous link', async () => {
    const email = uniqueEmail('resend');
    const tokens = await register(email);
    const first = tokenFrom(await nextMail(email, /confirm/), 'verify-email');
    mailbox.sent.length = 0;

    assert.equal((await post('/auth/email-verification/request', {}, tokens.accessToken)).status, 204);
    const second = tokenFrom(await nextMail(email, /confirm/), 'verify-email');
    assert.notEqual(first, second);

    assert.equal((await post('/auth/email-verification/confirm', { token: first })).status, 400);
    assert.equal((await post('/auth/email-verification/confirm', { token: second })).status, 204);
  });

  it('rejects expired and unknown links', async () => {
    const email = uniqueEmail('expired');
    const tokens = await register(email);
    const token = tokenFrom(await nextMail(email, /confirm/), 'verify-email');
    await db.query(`UPDATE auth_action_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = $1`, [tokens.user.id]);
    assert.equal((await post('/auth/email-verification/confirm', { token })).status, 400);
    assert.equal((await post('/auth/email-verification/confirm', { token: randomBytes(32).toString('base64url') })).status, 400);
  });

  it('stores only token hashes', async () => {
    const email = uniqueEmail('hashes');
    await register(email);
    const token = tokenFrom(await nextMail(email, /confirm/), 'verify-email');
    assert.equal((await db.query('SELECT 1 FROM auth_action_tokens WHERE token_hash = $1', [token])).rowCount, 0);
  });

  it('requires sign-in to request a new link', async () => {
    assert.equal((await post('/auth/email-verification/request', {})).status, 401);
  });
});

describe('password reset', () => {
  it('answers 202 for unknown emails and sends nothing', async () => {
    const response = await post('/auth/password-reset/request', { email: uniqueEmail('nobody') });
    assert.equal(response.status, 202);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(mailbox.sent.length, 0);
  });

  it('resets the password, signs out every session and verifies the email', async () => {
    const email = uniqueEmail('reset');
    const phone = await register(email);
    const laptopResponse = await post('/auth/login', { email, password: PASSWORD });
    const laptop = (await laptopResponse.json()) as AuthTokensResponse;
    mailbox.sent.length = 0;

    assert.equal((await post('/auth/password-reset/request', { email: email.toUpperCase() })).status, 202);
    const mail = await nextMail(email, /password/);
    const token = tokenFrom(mail, 'reset-password');

    assert.equal((await post('/auth/password-reset/confirm', { token, newPassword: NEW_PASSWORD })).status, 204);

    for (const session of [phone, laptop]) {
      const check = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
      assert.equal(check.status, 401, 'every existing session is signed out');
      assert.equal((await post('/auth/refresh', { refreshToken: session.refreshToken })).status, 401);
    }

    assert.equal((await post('/auth/login', { email, password: PASSWORD })).status, 401, 'old password no longer works');
    const login = await post('/auth/login', { email, password: NEW_PASSWORD });
    assert.equal(login.status, 200);
    const fresh = (await login.json()) as AuthTokensResponse;
    assert.equal(fresh.user.emailVerified, true);

    assert.equal((await post('/auth/password-reset/confirm', { token, newPassword: 'yet another password 1' })).status, 400);

    const events = await db.query<{ type: string }>(
      `SELECT type FROM security_events WHERE user_id = $1 AND type LIKE 'PASSWORD_RESET%' ORDER BY id`,
      [phone.user.id],
    );
    assert.deepEqual(events.rows.map((row) => row.type), ['PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED']);
  });

  it('only the newest reset link works, and links expire', async () => {
    const email = uniqueEmail('newest');
    const tokens = await register(email);
    await post('/auth/password-reset/request', { email });
    const first = tokenFrom(await nextMail(email, /password/), 'reset-password');
    mailbox.sent.length = 0;
    await post('/auth/password-reset/request', { email });
    const second = tokenFrom(await nextMail(email, /password/), 'reset-password');

    assert.equal((await post('/auth/password-reset/confirm', { token: first, newPassword: NEW_PASSWORD })).status, 400);

    await db.query(
      `UPDATE auth_action_tokens SET expires_at = now() - interval '1 second' WHERE user_id = $1 AND purpose = 'PASSWORD_RESET'`,
      [tokens.user.id],
    );
    assert.equal((await post('/auth/password-reset/confirm', { token: second, newPassword: NEW_PASSWORD })).status, 400);
  });

  it('a verification link cannot be used to reset a password', async () => {
    const email = uniqueEmail('purpose');
    await register(email);
    const verificationToken = tokenFrom(await nextMail(email, /confirm/), 'verify-email');
    const response = await post('/auth/password-reset/confirm', { token: verificationToken, newPassword: NEW_PASSWORD });
    assert.equal(response.status, 400);
  });

  it('validates the new password', async () => {
    const response = await post('/auth/password-reset/confirm', { token: randomBytes(32).toString('base64url'), newPassword: 'short' });
    assert.equal(response.status, 400);
  });

  it('suspended accounts get no reset email', async () => {
    const email = uniqueEmail('suspended');
    const tokens = await register(email);
    await db.query(`UPDATE users SET status = 'SUSPENDED' WHERE id = $1`, [tokens.user.id]);
    mailbox.sent.length = 0;
    assert.equal((await post('/auth/password-reset/request', { email })).status, 202);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(mailbox.sent.length, 0);
  });

  it('rate-limits reset requests per account (429)', async () => {
    const email = uniqueEmail('flood');
    await register(email);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push((await post('/auth/password-reset/request', { email })).status);
    }
    assert.deepEqual(statuses, [202, 202, 202, 202, 202, 429]);
  });
});

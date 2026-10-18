// End-to-end tests of the authentication API against a throwaway, fully migrated database.
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import type { ApiErrorResponse, AuthTokensResponse, MeResponse } from '@flower-man/contracts';
import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';

import { API_PREFIX, createApp } from '../app.factory.js';
import { AppModule } from '../app.module.js';
import { type AppConfig, loadAppConfig } from '../config/app-config.js';
import { createTestDatabase, type TestDatabase } from '../testing/test-database.js';
import { AuthGuard, RequireCapabilities } from './auth.guard.js';

const PASSWORD = 'correct horse battery staple';
const uniqueEmail = (label: string) => `${label}.${randomBytes(4).toString('hex')}@Example.com`;

let database: TestDatabase;
let config: AppConfig;
let app: NestExpressApplication;
let baseUrl: string;
let db: pg.Pool;

async function post(path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function get(path: string, token?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

async function register(email = uniqueEmail('user')): Promise<AuthTokensResponse> {
  const response = await post('/auth/register', { email, password: PASSWORD, fullName: 'Test User', phone: '+393331234567' });
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json()) as AuthTokensResponse;
}

async function errorOf(response: Response): Promise<ApiErrorResponse['error']> {
  return ((await response.json()) as ApiErrorResponse).error;
}

before(async () => {
  const base = loadAppConfig({ ...process.env, NODE_ENV: 'test', MAIL_TRANSPORT: 'memory' });
  database = await createTestDatabase(base.database);
  // Many registrations come from one test IP: raise only that limit. Login limits stay real,
  // and live in PostgreSQL as in production, so several app instances share them.
  config = {
    ...base,
    nodeEnv: 'test',
    rateLimitStore: 'postgres',
    database: database.config,
    auth: { ...base.auth, rateLimits: { ...base.auth.rateLimits, registerPerIp: { limit: 1_000, windowMs: 60_000 } } },
  };
  app = await createApp(config);
  await app.listen(0, '127.0.0.1');
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/${API_PREFIX}`;
  db = new pg.Pool({ connectionString: database.config.connectionString, ssl: database.config.ssl });
});

after(async () => {
  await db.end();
  await app.close();
  await database.drop();
});

describe('POST /auth/register', () => {
  it('creates a CUSTOMER, signs them in and records the event', async () => {
    const email = uniqueEmail('Ada');
    const tokens = await register(email);
    assert.equal(tokens.user.email, email);
    assert.deepEqual(tokens.user.capabilities, ['CUSTOMER']);
    assert.equal(tokens.user.emailVerified, false);
    assert.equal(tokens.user.phone, '+393331234567');
    assert.ok(Date.parse(tokens.accessTokenExpiresAt) - Date.now() <= 15 * 60_000);
    assert.ok(Date.parse(tokens.refreshTokenExpiresAt) - Date.now() > 29 * 24 * 3_600_000);

    const events = await db.query<{ type: string }>('SELECT type FROM security_events WHERE user_id = $1 ORDER BY id', [tokens.user.id]);
    assert.deepEqual(events.rows.map((row) => row.type), ['REGISTERED', 'EMAIL_VERIFICATION_SENT']);
  });

  it('stores only a scrypt hash of the password, and only a hash of the refresh token', async () => {
    const tokens = await register();
    const credentials = await db.query<{ password_hash: string }>('SELECT password_hash FROM user_credentials WHERE user_id = $1', [tokens.user.id]);
    const hash = credentials.rows[0]?.password_hash ?? '';
    assert.match(hash, /^scrypt\$/);
    assert.ok(!hash.includes(PASSWORD));

    const stored = await db.query('SELECT 1 FROM auth_refresh_tokens WHERE token_hash = $1', [tokens.refreshToken]);
    assert.equal(stored.rowCount, 0, 'the raw refresh token must never be stored');
  });

  it('refuses a second account with the same email in any letter case (409)', async () => {
    const email = uniqueEmail('dup');
    await register(email);
    const response = await post('/auth/register', { email: email.toUpperCase(), password: PASSWORD, fullName: 'Again' });
    assert.equal(response.status, 409);
    assert.equal((await errorOf(response)).code, 'CONFLICT');
  });

  it('validates the body and rejects unknown fields (400)', async () => {
    const response = await post('/auth/register', { email: 'x', password: 'short', fullName: 'A', capabilities: ['PLATFORM_OWNER'] });
    assert.equal(response.status, 400);
    const error = await errorOf(response);
    assert.match(error.message, /email:/);
    assert.match(error.message, /capabilities/);
  });
});

describe('POST /auth/login', () => {
  it('signs in with the right password, case-insensitively by email', async () => {
    const email = uniqueEmail('login');
    await register(email);
    const response = await post('/auth/login', { email: email.toLowerCase(), password: PASSWORD });
    assert.equal(response.status, 200);
    const tokens = (await response.json()) as AuthTokensResponse;
    const me = await get('/auth/me', tokens.accessToken);
    assert.equal(me.status, 200);
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const email = uniqueEmail('wrong');
    await register(email);
    const wrongPassword = await post('/auth/login', { email, password: 'not the password' });
    const unknownEmail = await post('/auth/login', { email: uniqueEmail('nobody'), password: PASSWORD });
    assert.equal(wrongPassword.status, 401);
    assert.equal(unknownEmail.status, 401);
    assert.equal((await errorOf(wrongPassword)).message, (await errorOf(unknownEmail)).message);
  });

  it('refuses suspended accounts and ends their existing sessions', async () => {
    const email = uniqueEmail('suspended');
    const tokens = await register(email);
    await db.query(`UPDATE users SET status = 'SUSPENDED' WHERE id = $1`, [tokens.user.id]);

    const login = await post('/auth/login', { email, password: PASSWORD });
    assert.equal(login.status, 403);
    assert.equal((await get('/auth/me', tokens.accessToken)).status, 401);
    assert.equal((await post('/auth/refresh', { refreshToken: tokens.refreshToken })).status, 401);
  });

  it('rate-limits registrations per IP (429)', async () => {
    // The counter is shared with the main app instance, which registered many users already.
    await db.query(`DELETE FROM rate_limit_windows WHERE key LIKE 'register-ip:%'`);
    const strict = await createApp({
      ...config,
      auth: { ...config.auth, rateLimits: { ...config.auth.rateLimits, registerPerIp: { limit: 2, windowMs: 60_000 } } },
    });
    await strict.listen(0, '127.0.0.1');
    try {
      const url = `http://127.0.0.1:${(strict.getHttpServer().address() as AddressInfo).port}/${API_PREFIX}/auth/register`;
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: uniqueEmail('flood'), password: PASSWORD, fullName: 'Flood' }),
        });
        statuses.push(response.status);
      }
      assert.deepEqual(statuses, [201, 201, 429]);
    } finally {
      await strict.close();
    }
  });

  it('rate-limits repeated attempts on one account (429 + Retry-After)', async () => {
    const email = uniqueEmail('brute');
    await register(email);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      statuses.push((await post('/auth/login', { email, password: `guess number ${attempt}` })).status);
    }
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
    assert.equal(statuses[10], 429);
    const blocked = await post('/auth/login', { email, password: PASSWORD });
    assert.equal(blocked.status, 429, 'even the right password waits for the window to reset');
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  });

  it('shares the limit between API instances and stores only hashed keys', async () => {
    const email = uniqueEmail('spread');
    await register(email);
    const second = await createApp(config);
    await second.listen(0, '127.0.0.1');
    try {
      const secondUrl = `http://127.0.0.1:${(second.getHttpServer().address() as AddressInfo).port}/${API_PREFIX}/auth/login`;
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 11; attempt += 1) {
        // Alternate instances: an attacker spreading attempts over a load balancer gains nothing.
        const credentials = { email, password: `guess number ${attempt}` };
        const response =
          attempt % 2 === 0
            ? await post('/auth/login', credentials)
            : await fetch(secondUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
        statuses.push(response.status);
      }
      assert.deepEqual(statuses.slice(0, 10), Array(10).fill(401));
      assert.equal(statuses[10], 429);
    } finally {
      await second.close();
    }
    const keys = await db.query<{ key: string }>(`SELECT key FROM rate_limit_windows`);
    assert.ok(keys.rows.length > 0);
    for (const { key } of keys.rows) {
      assert.match(key, /^[a-z-]+:[0-9a-f]{64}$/, 'no email or IP in clear');
    }
  });
});

describe('POST /auth/refresh', () => {
  it('rotates tokens: the new pair works, the old refresh token is single use', async () => {
    const first = await register();
    const response = await post('/auth/refresh', { refreshToken: first.refreshToken });
    assert.equal(response.status, 200);
    const second = (await response.json()) as AuthTokensResponse;
    assert.notEqual(second.refreshToken, first.refreshToken);
    assert.equal(second.refreshTokenExpiresAt, first.refreshTokenExpiresAt, 'refresh never extends the session');
    assert.equal((await get('/auth/me', second.accessToken)).status, 200);
  });

  it('revokes the whole session when a used refresh token is replayed', async () => {
    const first = await register();
    const second = (await (await post('/auth/refresh', { refreshToken: first.refreshToken })).json()) as AuthTokensResponse;

    const replay = await post('/auth/refresh', { refreshToken: first.refreshToken });
    assert.equal(replay.status, 401);

    assert.equal((await get('/auth/me', second.accessToken)).status, 401, 'access tokens of the session stop working');
    assert.equal((await post('/auth/refresh', { refreshToken: second.refreshToken })).status, 401);

    const session = await db.query<{ revoke_reason: string }>(
      `SELECT s.revoke_reason FROM auth_sessions s WHERE s.user_id = $1`,
      [first.user.id],
    );
    assert.equal(session.rows[0]?.revoke_reason, 'REFRESH_TOKEN_REUSE');
  });

  it('rejects unknown tokens', async () => {
    assert.equal((await post('/auth/refresh', { refreshToken: randomBytes(32).toString('base64url') })).status, 401);
  });
});

describe('POST /auth/logout and GET /auth/me', () => {
  it('logout ends the session immediately', async () => {
    const tokens = await register();
    const me = await get('/auth/me', tokens.accessToken);
    assert.equal(((await me.json()) as MeResponse).user.id, tokens.user.id);

    const logout = await post('/auth/logout', {}, tokens.accessToken);
    assert.equal(logout.status, 204);
    assert.equal((await get('/auth/me', tokens.accessToken)).status, 401);
    assert.equal((await post('/auth/refresh', { refreshToken: tokens.refreshToken })).status, 401);
  });

  it('requires a valid bearer token', async () => {
    const tokens = await register();
    assert.equal((await get('/auth/me')).status, 401);
    assert.equal((await get('/auth/me', `${tokens.accessToken}x`)).status, 401);
    assert.equal((await get('/auth/me', 'not-a-token')).status, 401);
  });

  it('logs nothing secret in security events', async () => {
    const tokens = await register();
    const rows = await db.query<{ details: unknown; user_agent: string | null }>('SELECT details, user_agent FROM security_events');
    const dump = JSON.stringify(rows.rows);
    assert.ok(!dump.includes(PASSWORD));
    assert.ok(!dump.includes(tokens.refreshToken));
    assert.ok(!dump.includes(tokens.accessToken));
  });
});

describe('capability guard', () => {
  @Controller('probe')
  class ProbeController {
    @Get('admin')
    @UseGuards(AuthGuard)
    @RequireCapabilities('PLATFORM_ADMIN', 'PLATFORM_OWNER')
    admin(): { ok: true } {
      return { ok: true };
    }
  }

  @Module({ controllers: [ProbeController] })
  class ProbeModule {}

  let probe: NestExpressApplication;
  let probeUrl: string;

  before(async () => {
    @Module({ imports: [AppModule.forRoot(config), ProbeModule] })
    class ProbeAppModule {}
    probe = await NestFactory.create<NestExpressApplication>(ProbeAppModule, { logger: ['error'] });
    await probe.listen(0, '127.0.0.1');
    probeUrl = `http://127.0.0.1:${(probe.getHttpServer().address() as AddressInfo).port}`;
  });

  after(async () => {
    await probe.close();
  });

  it('denies a CUSTOMER (403) and allows the same user once PLATFORM_ADMIN is granted', async () => {
    const tokens = await register();
    const headers = { Authorization: `Bearer ${tokens.accessToken}` };
    assert.equal((await fetch(`${probeUrl}/probe/admin`)).status, 401);
    assert.equal((await fetch(`${probeUrl}/probe/admin`, { headers })).status, 403);

    await db.query(`INSERT INTO user_capabilities (user_id, capability) VALUES ($1, 'PLATFORM_ADMIN')`, [tokens.user.id]);
    assert.equal((await fetch(`${probeUrl}/probe/admin`, { headers })).status, 200, 'capabilities are read per request');
  });
});

describe('security_events', () => {
  it('is append-only', async () => {
    await register();
    await assert.rejects(db.query(`UPDATE security_events SET type = 'LOGGED_OUT'`), /append-only/);
    await assert.rejects(db.query('DELETE FROM security_events'), /append-only/);
  });
});

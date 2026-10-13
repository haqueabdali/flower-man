// Integration tests for the HTTP foundation: starts the real application on a random local port.
// Needs the development database (pnpm db:up) for the "database ok" case.
import 'reflect-metadata';

import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import type { ApiErrorResponse, HealthResponse } from '@flower-man/contracts';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { API_PREFIX, createApp } from './app.factory.js';
import { type AppConfig, loadAppConfig } from './config/app-config.js';

const ADMIN_ORIGIN = 'http://admin.flowerman.test';

async function start(overrides: Partial<AppConfig> = {}): Promise<{ app: NestExpressApplication; baseUrl: string }> {
  const config: AppConfig = {
    ...loadAppConfig(process.env),
    nodeEnv: 'test',
    corsOrigins: [ADMIN_ORIGIN],
    ...overrides,
  };
  const app = await createApp(config);
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { app, baseUrl: `http://127.0.0.1:${port}/${API_PREFIX}` };
}

async function errorBody(response: Response): Promise<ApiErrorResponse['error']> {
  const body = (await response.json()) as ApiErrorResponse;
  assert.equal(typeof body.error.requestId, 'string');
  assert.equal(body.error.requestId, response.headers.get('x-request-id'));
  return body.error;
}

describe('API foundation (HTTP)', () => {
  let app: NestExpressApplication;
  let baseUrl: string;

  before(async () => {
    ({ app, baseUrl } = await start());
  });

  after(async () => {
    await app.close();
  });

  it('GET /health reports ok with the database reachable', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = (await response.json()) as HealthResponse;
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'flower-man-api');
    assert.deepEqual(body.checks, { database: 'ok' });
    assert.ok(!Number.isNaN(Date.parse(body.time)));
  });

  it('sends security headers and hides the framework', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(response.headers.get('strict-transport-security'));
    assert.ok(response.headers.get('content-security-policy'));
    assert.equal(response.headers.get('x-powered-by'), null);
  });

  it('allows CORS only for configured origins', async () => {
    const allowed = await fetch(`${baseUrl}/health`, { headers: { Origin: ADMIN_ORIGIN } });
    assert.equal(allowed.headers.get('access-control-allow-origin'), ADMIN_ORIGIN);

    const other = await fetch(`${baseUrl}/health`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);

    const preflight = await fetch(`${baseUrl}/health`, {
      method: 'OPTIONS',
      headers: { Origin: ADMIN_ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), ADMIN_ORIGIN);
  });

  it('returns the standard error body for unknown routes', async () => {
    const response = await fetch(`${baseUrl}/does-not-exist`);
    assert.equal(response.status, 404);
    const error = await errorBody(response);
    assert.equal(error.code, 'NOT_FOUND');
  });

  it('rejects malformed JSON with 400', async () => {
    const response = await fetch(`${baseUrl}/health`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(response.status, 400);
    assert.equal((await errorBody(response)).code, 'BAD_REQUEST');
  });

  it('rejects bodies over 100 kB with 413', async () => {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(150_000) }),
    });
    assert.equal(response.status, 413);
    assert.equal((await errorBody(response)).code, 'PAYLOAD_TOO_LARGE');
  });

  it('echoes a safe client request ID and replaces an unsafe one', async () => {
    const safe = await fetch(`${baseUrl}/health`, { headers: { 'X-Request-Id': 'trace-abc-12345' } });
    assert.equal(safe.headers.get('x-request-id'), 'trace-abc-12345');

    const unsafe = await fetch(`${baseUrl}/health`, { headers: { 'X-Request-Id': 'bad id <script>' } });
    const generated = unsafe.headers.get('x-request-id') ?? '';
    assert.match(generated, /^[0-9a-f-]{36}$/);
  });
});

describe('API foundation (database unreachable)', () => {
  it('GET /health answers 503 with database "down" instead of failing', async () => {
    const { app, baseUrl } = await start({
      database: {
        connectionString: 'postgresql://nobody:nothing@127.0.0.1:1/none',
        ssl: false,
        description: '127.0.0.1:1/none',
      },
    });
    try {
      const response = await fetch(`${baseUrl}/health`);
      assert.equal(response.status, 503);
      const body = (await response.json()) as HealthResponse;
      assert.equal(body.status, 'down');
      assert.deepEqual(body.checks, { database: 'down' });
    } finally {
      await app.close();
    }
  });
});

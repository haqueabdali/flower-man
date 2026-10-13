import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SignJWT } from 'jose';

import { createAccessToken, generateRefreshToken, hashToken, verifyAccessToken } from './tokens.js';

const secret = new TextEncoder().encode('a'.repeat(40));
const otherSecret = new TextEncoder().encode('b'.repeat(40));
const claims = { userId: '7f6c3a8e-0000-4000-8000-000000000001', sessionId: '7f6c3a8e-0000-4000-8000-000000000002' };

describe('access tokens', () => {
  it('round-trips the claims', async () => {
    const { token, expiresAt } = await createAccessToken(claims, secret, 900);
    assert.deepEqual(await verifyAccessToken(token, secret), claims);
    assert.ok(expiresAt.getTime() > Date.now() + 890_000);
  });

  it('rejects expired tokens', async () => {
    const { token } = await createAccessToken(claims, secret, 60, new Date(Date.now() - 3_600_000));
    assert.equal(await verifyAccessToken(token, secret), undefined);
  });

  it('rejects tokens signed with another secret', async () => {
    const { token } = await createAccessToken(claims, otherSecret, 900);
    assert.equal(await verifyAccessToken(token, secret), undefined);
  });

  it('rejects tampered tokens', async () => {
    const { token } = await createAccessToken(claims, secret, 900);
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'someone-else', sid: claims.sessionId, typ: 'access' })).toString('base64url');
    assert.equal(await verifyAccessToken(`${header}.${forgedPayload}.${signature}`, secret), undefined);
  });

  it('rejects tokens without the access type or session', async () => {
    const now = Math.floor(Date.now() / 1000);
    const noType = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('flower-man-api')
      .setAudience('flower-man')
      .setSubject(claims.userId)
      .setExpirationTime(now + 60)
      .sign(secret);
    assert.equal(await verifyAccessToken(noType, secret), undefined);
  });

  it('rejects garbage', async () => {
    assert.equal(await verifyAccessToken('not.a.jwt', secret), undefined);
  });
});

describe('refresh tokens', () => {
  it('are 256-bit random base64url strings', () => {
    const token = generateRefreshToken();
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(token, generateRefreshToken());
  });

  it('hash to SHA-256 hex', () => {
    assert.match(hashToken('abc'), /^[0-9a-f]{64}$/);
    assert.equal(hashToken('abc'), hashToken('abc'));
  });
});

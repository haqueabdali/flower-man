import { createHash, randomBytes } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

const ISSUER = 'flower-man-api';
const AUDIENCE = 'flower-man';

export interface AccessTokenClaims {
  readonly userId: string;
  readonly sessionId: string;
}

export interface SignedAccessToken {
  readonly token: string;
  readonly expiresAt: Date;
}

export async function createAccessToken(
  claims: AccessTokenClaims,
  secret: Uint8Array,
  ttlSeconds: number,
  now: Date = new Date(),
): Promise<SignedAccessToken> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = new Date((issuedAt + ttlSeconds) * 1000);
  const token = await new SignJWT({ sid: claims.sessionId, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(claims.userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);
  return { token, expiresAt };
}

/** Returns the claims, or undefined for any invalid, expired or foreign token. */
export async function verifyAccessToken(token: string, secret: Uint8Array): Promise<AccessTokenClaims | undefined> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
    if (payload['typ'] !== 'access' || typeof payload.sub !== 'string' || typeof payload['sid'] !== 'string') {
      return undefined;
    }
    return { userId: payload.sub, sessionId: payload['sid'] };
  } catch {
    return undefined;
  }
}

/** 256-bit random opaque refresh token (base64url). Only its SHA-256 hash is stored. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

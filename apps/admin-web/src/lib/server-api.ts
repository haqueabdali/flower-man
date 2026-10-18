// Server-only helpers for the admin BFF (route handlers). Never import from client components.
import type { AuthTokensResponse } from '@flower-man/contracts';
import { API_GLOBAL_PREFIX, API_VERSION } from '@flower-man/contracts';

export const ACCESS_COOKIE = 'fm_admin_at';
export const REFRESH_COOKIE = 'fm_admin_rt';
export const CSRF_HEADER = 'x-flowerman-admin';

export function apiBase(): string {
  const base = (process.env.ADMIN_API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
  return `${base}/${API_GLOBAL_PREFIX}/${API_VERSION}`;
}

export const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
  maxAge: maxAgeSeconds,
});

export function isAdmin(tokens: AuthTokensResponse): boolean {
  return tokens.user.capabilities.some((capability) => capability === 'PLATFORM_ADMIN' || capability === 'PLATFORM_OWNER');
}

export async function refreshTokens(refreshToken: string): Promise<AuthTokensResponse | null> {
  const response = await fetch(`${apiBase()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  return response.ok ? ((await response.json()) as AuthTokensResponse) : null;
}

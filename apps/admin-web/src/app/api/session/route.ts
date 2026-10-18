import type { AuthTokensResponse } from '@flower-man/contracts';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACCESS_COOKIE, apiBase, cookieOptions, CSRF_HEADER, isAdmin, REFRESH_COOKIE } from '../../../lib/server-api';

const forbidden = (message: string, status = 403) => NextResponse.json({ error: { code: 'FORBIDDEN', message } }, { status });

/** Sign in: the tokens are stored in httpOnly cookies and never reach browser JavaScript. */
export async function POST(request: Request): Promise<NextResponse> {
  if (request.headers.get(CSRF_HEADER) !== '1') {
    return forbidden('Missing request header.');
  }
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const response = await fetch(`${apiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'flower-man-admin-web' },
    body: JSON.stringify({ email: body?.email, password: body?.password }),
    cache: 'no-store',
  });
  if (!response.ok) {
    return new NextResponse(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json' } });
  }
  const tokens = (await response.json()) as AuthTokensResponse;
  if (!isAdmin(tokens)) {
    await fetch(`${apiBase()}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    return forbidden('This account is not a Flower Man administrator.');
  }
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, tokens.accessToken, cookieOptions(15 * 60));
  jar.set(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(30 * 24 * 3600));
  return NextResponse.json({ user: tokens.user });
}

/** Sign out: ends the API session and clears the cookies. */
export async function DELETE(request: Request): Promise<NextResponse> {
  if (request.headers.get(CSRF_HEADER) !== '1') {
    return forbidden('Missing request header.');
  }
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  if (access) {
    await fetch(`${apiBase()}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${access}` } }).catch(() => undefined);
  }
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  return new NextResponse(null, { status: 204 });
}

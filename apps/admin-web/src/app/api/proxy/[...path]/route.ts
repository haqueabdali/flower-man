import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { ACCESS_COOKIE, apiBase, cookieOptions, CSRF_HEADER, refreshTokens, REFRESH_COOKIE } from '../../../../lib/server-api';

/** Only these API areas are reachable through the admin app. */
const ALLOWED = [/^admin(\/|$)/, /^auth\/me$/];
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

async function forward(request: Request, params: Promise<{ path: string[] }>): Promise<NextResponse> {
  const { path } = await params;
  if (!path.every((segment) => SAFE_SEGMENT.test(segment))) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Invalid path.' } }, { status: 400 });
  }
  const joined = path.join('/');
  if (!ALLOWED.some((pattern) => pattern.test(joined))) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, { status: 404 });
  }
  // Custom header: browsers cannot send it cross-site without a CORS preflight, which this app never allows.
  if (request.method !== 'GET' && request.headers.get(CSRF_HEADER) !== '1') {
    return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Missing request header.' } }, { status: 403 });
  }

  const jar = await cookies();
  let access = jar.get(ACCESS_COOKIE)?.value;
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  const search = new URL(request.url).search;
  const body = request.method === 'GET' ? undefined : await request.text();

  const call = (token: string | undefined) =>
    fetch(`${apiBase()}/${joined}${search}`, {
      method: request.method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        'User-Agent': 'flower-man-admin-web',
      },
      ...(body ? { body } : {}),
      cache: 'no-store',
    });

  let upstream = await call(access);
  if (upstream.status === 401 && refresh) {
    const renewed = await refreshTokens(refresh);
    if (renewed) {
      access = renewed.accessToken;
      jar.set(ACCESS_COOKIE, renewed.accessToken, cookieOptions(15 * 60));
      jar.set(REFRESH_COOKIE, renewed.refreshToken, cookieOptions(30 * 24 * 3600));
      upstream = await call(access);
    } else {
      jar.delete(ACCESS_COOKIE);
      jar.delete(REFRESH_COOKIE);
    }
  }
  const contentType = upstream.headers.get('content-type') ?? 'application/json';
  return new NextResponse(upstream.status === 204 ? null : await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
  });
}

type Context = { params: Promise<{ path: string[] }> };
export const GET = (request: Request, context: Context) => forward(request, context.params);
export const POST = (request: Request, context: Context) => forward(request, context.params);
export const PATCH = (request: Request, context: Context) => forward(request, context.params);
export const PUT = (request: Request, context: Context) => forward(request, context.params);
export const DELETE = (request: Request, context: Context) => forward(request, context.params);

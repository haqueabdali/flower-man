'use client';

import type { ApiErrorResponse } from '@flower-man/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Calls the API through the admin BFF (/api/proxy). Redirects to /login when the session is gone. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api/proxy/${path.replace(/^\//, '')}`, {
    method: init.method ?? 'GET',
    headers: {
      'x-flowerman-admin': '1',
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    cache: 'no-store',
  });
  if (response.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login';
  }
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    throw new ApiError(response.status, error?.error.message ?? `Request failed (${response.status})`);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export const euro = (minor: number | string | null | undefined): string =>
  minor === null || minor === undefined ? '—' : `€${(Number(minor) / 100).toFixed(2).replace('.', ',')}`;

export const when = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString('it-IT') : '—');

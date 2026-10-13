import type { Request } from 'express';

import type { RequestMeta } from './security-events.js';

export function requestMeta(request: Request): RequestMeta {
  return {
    ip: request.ip ?? null,
    userAgent: request.header('user-agent')?.slice(0, 512) ?? null,
  };
}

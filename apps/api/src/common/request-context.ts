import { randomUUID } from 'node:crypto';

import { REQUEST_ID_HEADER } from '@flower-man/contracts';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');

/** Client-supplied request IDs are accepted only if they are short and harmless in logs. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

export function getRequestId(response: Response): string {
  const value: unknown = response.locals['requestId'];
  return typeof value === 'string' ? value : 'unknown';
}

/**
 * Assigns a request ID (echoed in the X-Request-Id header and in error bodies) and writes one
 * access-log line per request. Logs the path only: query strings and bodies can hold secrets.
 */
export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const incoming = request.header(REQUEST_ID_HEADER);
  const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  response.locals['requestId'] = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);

  const started = performance.now();
  response.on('finish', () => {
    const durationMs = Math.round(performance.now() - started);
    logger.log(`${request.method} ${request.path} ${response.statusCode} ${durationMs}ms [${requestId}]`);
  });
  next();
}

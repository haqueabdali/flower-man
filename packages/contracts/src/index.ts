/**
 * @flower-man/contracts
 *
 * API contracts shared by the API, admin web app and both mobile apps.
 * Must stay free of framework (NestJS / React) and Node.js-only imports.
 */

/** Global route prefix and version for every REST endpoint: /api/v1/... */
export const API_GLOBAL_PREFIX = 'api';
export const API_VERSION = 'v1';

/** Response header carrying the request ID (also accepted from clients for tracing). */
export const REQUEST_ID_HEADER = 'x-request-id';

export type HealthStatus = 'ok' | 'degraded' | 'down';

/** GET /api/v1/health. HTTP 200 when status is "ok", 503 otherwise. */
export interface HealthResponse {
  readonly status: HealthStatus;
  readonly service: string;
  readonly version: string;
  /** ISO-8601 UTC timestamp. */
  readonly time: string;
  readonly checks: {
    readonly database: 'ok' | 'down';
  };
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UNPROCESSABLE_ENTITY'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

/** Body of every error response. Never contains stack traces or internal details. */
export interface ApiErrorResponse {
  readonly error: {
    readonly code: ApiErrorCode;
    readonly message: string;
    /** Quote this when reporting a problem: it locates the request in the server logs. */
    readonly requestId: string;
  };
}

export * from './auth.js';

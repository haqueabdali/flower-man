/**
 * @flower-man/contracts
 *
 * API contracts shared by the API, admin web app and both mobile apps.
 * Must stay free of framework (NestJS / React) and Node.js-only imports.
 */

/** Global route prefix and version for every REST endpoint: /api/v1/... */
export const API_GLOBAL_PREFIX = 'api';
export const API_VERSION = 'v1';

export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthResponse {
  readonly status: HealthStatus;
  readonly service: string;
  readonly version: string;
  /** ISO-8601 UTC timestamp. */
  readonly time: string;
}

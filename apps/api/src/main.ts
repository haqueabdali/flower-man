// Placeholder entry point. Replaced by the NestJS bootstrap in a later milestone.
// It exists so the workspace links and typechecks against every shared package.
import { API_GLOBAL_PREFIX, API_VERSION, type HealthResponse } from '@flower-man/contracts';
import { assertNever } from '@flower-man/domain';
import { isSensitiveKey } from '@flower-man/security';

const health: HealthResponse = {
  status: 'ok',
  service: 'flower-man-api',
  version: '0.0.0',
  time: new Date().toISOString(),
};

function describe(status: HealthResponse['status']): string {
  switch (status) {
    case 'ok':
      return 'healthy';
    case 'degraded':
      return 'degraded';
    case 'down':
      return 'down';
    default:
      return assertNever(status);
  }
}

console.log(
  `/${API_GLOBAL_PREFIX}/${API_VERSION}`,
  describe(health.status),
  isSensitiveKey('password'),
);

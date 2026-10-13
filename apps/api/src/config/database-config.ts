import { ConfigError } from './config-error.js';

export interface DatabaseConfig {
  readonly connectionString: string;
  /** false = plain TCP (local Docker only). Otherwise TLS with certificate verification. */
  readonly ssl: false | { readonly rejectUnauthorized: true };
  /** host:port/database. Safe to log: never contains credentials. */
  readonly description: string;
}

const PROTOCOLS = new Set(['postgres:', 'postgresql:']);

/**
 * Reads DATABASE_URL and DATABASE_SSL.
 *
 * DATABASE_SSL is the only TLS switch. ssl* parameters in DATABASE_URL are rejected because
 * the pg driver lets them silently override the ssl option (e.g. ?sslmode=disable turns TLS off).
 */
export function loadDatabaseConfig(env: NodeJS.ProcessEnv): DatabaseConfig {
  const rawUrl = env.DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new ConfigError('DATABASE_URL is not set. Copy .env.example to .env for local development.');
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ConfigError('DATABASE_URL is not a valid URL (expected postgresql://user:password@host:port/database).');
  }

  if (!PROTOCOLS.has(url.protocol)) {
    throw new ConfigError('DATABASE_URL must start with postgresql:// or postgres://.');
  }
  if ((url.pathname + url.search + url.hash).includes('@')) {
    // An unencoded '/', '?' or '#' in the password moves part of it into the path or query.
    throw new ConfigError(
      'DATABASE_URL looks malformed: percent-encode special characters (@ : / ? # %) in the user name and password.',
    );
  }
  if (!url.hostname) {
    throw new ConfigError('DATABASE_URL has no host.');
  }
  let database: string;
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    decodeURIComponent(url.username);
    decodeURIComponent(url.password);
  } catch {
    throw new ConfigError('DATABASE_URL has invalid percent-encoding.');
  }
  if (!database) {
    throw new ConfigError('DATABASE_URL has no database name.');
  }
  for (const key of url.searchParams.keys()) {
    if (key.toLowerCase().startsWith('ssl')) {
      throw new ConfigError(
        `Remove "${key}" from DATABASE_URL. TLS is configured only with DATABASE_SSL=true|false.`,
      );
    }
  }

  const rawSsl = env.DATABASE_SSL?.trim().toLowerCase();
  if (rawSsl !== 'true' && rawSsl !== 'false') {
    throw new ConfigError('DATABASE_SSL must be set to "true" or "false".');
  }
  const sslEnabled = rawSsl === 'true';

  if (env.NODE_ENV?.trim().toLowerCase() === 'production' && !sslEnabled) {
    throw new ConfigError('DATABASE_SSL must be "true" when NODE_ENV=production.');
  }

  return {
    connectionString: rawUrl,
    ssl: sslEnabled ? { rejectUnauthorized: true } : false,
    description: `${url.hostname}:${url.port || '5432'}/${database}`,
  };
}

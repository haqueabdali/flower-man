import { ConfigError } from './config-error.js';
import { type DatabaseConfig, loadDatabaseConfig } from './database-config.js';

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly host: string;
  readonly port: number;
  /** Exact browser origins allowed by CORS (e.g. the admin web app). Mobile apps do not need CORS. */
  readonly corsOrigins: readonly string[];
  /** Express "trust proxy": false, or the number of reverse-proxy hops in front of the API. */
  readonly trustProxy: false | number;
  readonly version: string;
  readonly database: DatabaseConfig;
}

const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];

function parseNodeEnv(raw: string | undefined): NodeEnv {
  const value = (raw?.trim().toLowerCase() || 'development') as NodeEnv;
  if (!NODE_ENVS.includes(value)) {
    throw new ConfigError(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}.`);
  }
  return value;
}

function parseIntegerInRange(name: string, raw: string | undefined, fallback: number, min: number, max: number): number {
  const text = raw?.trim();
  if (!text) {
    return fallback;
  }
  if (!/^\d+$/.test(text)) {
    throw new ConfigError(`${name} must be a whole number between ${min} and ${max}.`);
  }
  const value = Number(text);
  if (value < min || value > max) {
    throw new ConfigError(`${name} must be a whole number between ${min} and ${max}.`);
  }
  return value;
}

function parseCorsOrigins(raw: string | undefined, nodeEnv: NodeEnv): string[] {
  const entries = (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

  return entries.map((entry) => {
    if (entry === '*') {
      throw new ConfigError('CORS_ORIGINS must list exact origins. "*" is not allowed.');
    }
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new ConfigError(`CORS_ORIGINS entry "${entry}" is not a valid origin (e.g. https://admin.example.com).`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new ConfigError(`CORS_ORIGINS entry "${entry}" must use http or https.`);
    }
    if (url.origin !== entry.replace(/\/$/, '')) {
      throw new ConfigError(`CORS_ORIGINS entry "${entry}" must be an origin only (scheme://host[:port]), without path.`);
    }
    if (nodeEnv === 'production' && url.protocol !== 'https:') {
      throw new ConfigError(`CORS_ORIGINS entry "${entry}" must use https in production.`);
    }
    return url.origin;
  });
}

function parseTrustProxy(raw: string | undefined): false | number {
  const text = raw?.trim().toLowerCase();
  if (!text || text === 'false') {
    return false;
  }
  return parseIntegerInRange('TRUST_PROXY', text, 0, 1, 10);
}

/** Reads and validates the whole API configuration. Throws ConfigError (never containing secrets). */
export function loadAppConfig(env: NodeJS.ProcessEnv): AppConfig {
  const nodeEnv = parseNodeEnv(env.NODE_ENV);
  return {
    nodeEnv,
    host: env.HOST?.trim() || '127.0.0.1',
    port: parseIntegerInRange('PORT', env.PORT, 4000, 1, 65535),
    corsOrigins: parseCorsOrigins(env.CORS_ORIGINS, nodeEnv),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    version: env.APP_VERSION?.trim() || '0.0.0-dev',
    database: loadDatabaseConfig(env),
  };
}

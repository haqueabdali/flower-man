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
  readonly auth: AuthConfig;
  readonly mail: MailConfig;
}

export interface MailConfig {
  /** log: print emails to the API log (development only). smtp: send. memory: keep in memory (tests only). */
  readonly transport: 'log' | 'smtp' | 'memory';
  readonly from: string;
  /** smtp://user:pass@host:port or smtps://... Required for transport "smtp". */
  readonly smtpUrl: string | null;
  /** Base URL of links in emails, e.g. https://app.flowerman.it → .../verify-email?token=... */
  readonly linkBaseUrl: string;
}

function parseMailConfig(env: NodeJS.ProcessEnv, nodeEnv: NodeEnv): MailConfig {
  const transport = (env.MAIL_TRANSPORT?.trim().toLowerCase() || 'log') as MailConfig['transport'];
  if (!['log', 'smtp', 'memory'].includes(transport)) {
    throw new ConfigError('MAIL_TRANSPORT must be "log" or "smtp".');
  }
  if (transport === 'memory' && nodeEnv !== 'test') {
    throw new ConfigError('MAIL_TRANSPORT=memory is only allowed with NODE_ENV=test.');
  }
  if (transport === 'log' && nodeEnv === 'production') {
    throw new ConfigError('MAIL_TRANSPORT=log would print verification and reset links to the log. Use "smtp" in production.');
  }

  const from = env.MAIL_FROM?.trim() || 'Flower Man <no-reply@flowerman.localhost>';

  const smtpUrl = env.SMTP_URL?.trim() || null;
  if (transport === 'smtp') {
    if (!smtpUrl) {
      throw new ConfigError('SMTP_URL is required when MAIL_TRANSPORT=smtp (e.g. smtp://127.0.0.1:1025).');
    }
    let parsed: URL;
    try {
      parsed = new URL(smtpUrl);
    } catch {
      throw new ConfigError('SMTP_URL is not a valid URL (smtp://user:password@host:port).');
    }
    if (parsed.protocol !== 'smtp:' && parsed.protocol !== 'smtps:') {
      throw new ConfigError('SMTP_URL must start with smtp:// or smtps://.');
    }
  }

  const rawLinkBase = env.EMAIL_LINK_BASE_URL?.trim() || 'http://localhost:3000';
  let linkBase: URL;
  try {
    linkBase = new URL(rawLinkBase);
  } catch {
    throw new ConfigError('EMAIL_LINK_BASE_URL is not a valid URL.');
  }
  if (nodeEnv === 'production' && linkBase.protocol !== 'https:') {
    throw new ConfigError('EMAIL_LINK_BASE_URL must use https in production.');
  }

  return { transport, from, smtpUrl, linkBaseUrl: linkBase.toString().replace(/\/$/, '') };
}

export interface AuthConfig {
  /** HS256 key for access tokens (AUTH_ACCESS_TOKEN_SECRET, at least 32 characters). */
  readonly accessTokenSecret: Uint8Array;
  readonly accessTokenTtlSeconds: number;
  /** Absolute session lifetime: refresh tokens stop working after this. */
  readonly sessionTtlDays: number;
  readonly rateLimits: AuthRateLimits;
}

export interface RateLimit {
  readonly limit: number;
  readonly windowMs: number;
}

export interface AuthRateLimits {
  readonly loginPerAccount: RateLimit;
  readonly loginPerIp: RateLimit;
  readonly registerPerIp: RateLimit;
  readonly refreshPerIp: RateLimit;
  readonly passwordResetPerIp: RateLimit;
  readonly passwordResetPerAccount: RateLimit;
  readonly verificationEmailPerUser: RateLimit;
}

const MINUTE = 60_000;

export const DEFAULT_AUTH_RATE_LIMITS: AuthRateLimits = {
  loginPerAccount: { limit: 10, windowMs: 15 * MINUTE },
  loginPerIp: { limit: 50, windowMs: 15 * MINUTE },
  registerPerIp: { limit: 10, windowMs: 60 * MINUTE },
  refreshPerIp: { limit: 60, windowMs: MINUTE },
  passwordResetPerIp: { limit: 20, windowMs: 60 * MINUTE },
  passwordResetPerAccount: { limit: 5, windowMs: 60 * MINUTE },
  verificationEmailPerUser: { limit: 5, windowMs: 60 * MINUTE },
};

/** The value shipped in .env.example. Accepted locally, refused in production. */
export const EXAMPLE_ACCESS_TOKEN_SECRET = 'dev-only-access-token-secret-change-me-0000';

function parseAuthConfig(env: NodeJS.ProcessEnv, nodeEnv: NodeEnv): AuthConfig {
  const secret = env.AUTH_ACCESS_TOKEN_SECRET?.trim() ?? '';
  if (secret.length < 32) {
    throw new ConfigError('AUTH_ACCESS_TOKEN_SECRET must be set to at least 32 random characters (openssl rand -base64 48).');
  }
  if (nodeEnv === 'production' && secret === EXAMPLE_ACCESS_TOKEN_SECRET) {
    throw new ConfigError('AUTH_ACCESS_TOKEN_SECRET still has the .env.example value. Generate a real secret for production.');
  }
  return {
    accessTokenSecret: new TextEncoder().encode(secret),
    accessTokenTtlSeconds: 15 * 60,
    sessionTtlDays: 30,
    rateLimits: DEFAULT_AUTH_RATE_LIMITS,
  };
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
    auth: parseAuthConfig(env, nodeEnv),
    mail: parseMailConfig(env, nodeEnv),
  };
}

import { createHash } from 'node:crypto';

import type pg from 'pg';

export interface RateLimitResult {
  readonly allowed: boolean;
  /** Seconds until the window resets (for the Retry-After header). */
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string): Promise<RateLimitResult>;
}

/** Builds the limiter for one named rule (e.g. "login-ip"). Keys of different rules never collide. */
export type RateLimiterFactory = (name: string, limit: number, windowMs: number) => RateLimiter;

export const RATE_LIMITER_FACTORY = Symbol('RATE_LIMITER_FACTORY');

interface Window {
  count: number;
  resetAt: number;
}

/** Fixed-window counter kept in this process's memory. Enough for a single API instance (ADR-010). */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  consume(key: string): Promise<RateLimitResult> {
    const now = this.now();
    if (this.windows.size > 10_000) {
      this.sweep(now);
    }
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    return Promise.resolve({
      allowed: window.count <= this.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
    });
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}

/**
 * The same fixed window in PostgreSQL, shared by every API instance (ADR-015).
 * One atomic upsert per attempt; expired rows are purged by the maintenance job.
 * Keys are stored hashed: the table never holds an email address or an IP in clear.
 */
export class PostgresRateLimiter implements RateLimiter {
  constructor(
    private readonly pool: pg.Pool,
    private readonly name: string,
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  async consume(key: string): Promise<RateLimitResult> {
    const result = await this.pool.query<{ count: number; remaining_ms: number }>(
      `INSERT INTO rate_limit_windows AS w (key, count, reset_at)
       VALUES ($1, 1, clock_timestamp() + make_interval(secs => $2::int / 1000.0))
       ON CONFLICT (key) DO UPDATE SET
         count    = CASE WHEN w.reset_at <= clock_timestamp() THEN 1 ELSE w.count + 1 END,
         reset_at = CASE WHEN w.reset_at <= clock_timestamp() THEN EXCLUDED.reset_at ELSE w.reset_at END
       RETURNING count, (extract(epoch FROM (reset_at - clock_timestamp())) * 1000)::float8 AS remaining_ms`,
      [`${this.name}:${createHash('sha256').update(key).digest('hex')}`, this.windowMs],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error('Rate limit upsert returned no row');
    }
    return {
      allowed: row.count <= this.limit,
      retryAfterSeconds: Math.max(1, Math.ceil(row.remaining_ms / 1000)),
    };
  }
}

export function memoryRateLimiterFactory(): RateLimiterFactory {
  return (_name, limit, windowMs) => new MemoryRateLimiter(limit, windowMs);
}

export function postgresRateLimiterFactory(pool: pg.Pool): RateLimiterFactory {
  return (name, limit, windowMs) => new PostgresRateLimiter(pool, name, limit, windowMs);
}

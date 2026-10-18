export interface RateLimitResult {
  readonly allowed: boolean;
  /** Seconds until the window resets (for the Retry-After header). */
  readonly retryAfterSeconds: number;
}

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window counter kept in this process's memory. Enough for a single API instance.
 * With several instances, replace it with a shared store (ADR-010).
 */
export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  consume(key: string): RateLimitResult {
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
    return {
      allowed: window.count <= this.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)),
    };
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}

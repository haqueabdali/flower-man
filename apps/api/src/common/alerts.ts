import { Logger } from '@nestjs/common';

/** Injection token: @Inject(ALERTER) alerter: Alerter */
export const ALERTER = Symbol('ALERTER');

const SAME_ALERT_INTERVAL_MS = 5 * 60_000;
const MAX_PER_HOUR = 20;

/**
 * Posts operational alerts ({ text }) to a team chat webhook (Slack, Google Chat, Mattermost; Discord with "/slack" appended).
 * Best effort and rate-limited: the same alert at most every 5 minutes, at most 20 per hour. Never include personal data.
 */
export class Alerter {
  private readonly logger = new Logger('Alerts');
  private readonly lastSent = new Map<string, number>();
  private sentThisHour: number[] = [];

  constructor(
    private readonly webhookUrl: string | null,
    private readonly source: string,
    private readonly send: (url: string, body: string) => Promise<unknown> = (url, body) =>
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(5_000) }),
    private readonly now: () => number = Date.now,
  ) {}

  /** `key` groups repeats of the same problem (e.g. "GET /api/v1/orders/:id 500"). Returns whether it was sent. */
  report(key: string, message: string): boolean {
    if (!this.webhookUrl) return false;
    const now = this.now();
    this.sentThisHour = this.sentThisHour.filter((at) => at > now - 3_600_000);
    const last = this.lastSent.get(key);
    if ((last !== undefined && now - last < SAME_ALERT_INTERVAL_MS) || this.sentThisHour.length >= MAX_PER_HOUR) {
      return false;
    }
    this.lastSent.set(key, now);
    this.sentThisHour.push(now);
    const text = `⚠️ ${this.source}: ${message}`.slice(0, 1_000);
    void this.send(this.webhookUrl, JSON.stringify({ text })).catch((error: unknown) => this.logger.warn(`Alert webhook failed: ${(error as Error).message}`));
    return true;
  }
}

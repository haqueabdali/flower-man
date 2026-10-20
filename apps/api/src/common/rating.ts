import type { Rating } from '@flower-man/contracts';

/** Running totals (partner_accounts.rating_sum / rating_count) as an average with one decimal. */
export function toRating(sum: number, count: number): Rating | null {
  return count > 0 ? { average: Math.round((sum / count) * 10) / 10, count } : null;
}

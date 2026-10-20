import { basisPointsOf, multiplyMinor, sumMinor } from './money.js';
import type { OrderAmounts } from './order.js';

export interface PricedLine {
  readonly unitPrice: number;
  readonly quantity: number;
}

/** Authoritative order amounts, computed server-side from database prices only. */
export function calculateOrderAmounts(
  lines: readonly PricedLine[],
  deliveryFee: number,
  commissionBasisPoints: number,
): OrderAmounts {
  if (lines.length === 0) {
    throw new RangeError('an order needs at least one line');
  }
  const subtotal = sumMinor(lines.map((line) => multiplyMinor(line.unitPrice, line.quantity)));
  if (subtotal <= 0) {
    throw new RangeError('subtotal must be positive');
  }
  const total = sumMinor([subtotal, deliveryFee]);
  const platformCommission = basisPointsOf(subtotal, commissionBasisPoints);
  return { subtotal, deliveryFee, total, platformCommission, sellerNet: subtotal - platformCommission };
}

/** Smallest amount a card payment can be (Stripe's EUR minimum). A discount never takes the total below it. */
export const MIN_CHARGE_MINOR = 50;

export interface Discount {
  readonly kind: 'PERCENT' | 'FIXED';
  /** PERCENT: 1–100 of the subtotal. FIXED: cents off the total. */
  readonly value: number;
  readonly maxDiscountMinor: number | null;
}

/**
 * Platform-funded discount on computed amounts: the customer pays less; subtotal, commission and seller net are unchanged.
 * Percentages round half-up to the cent; the result is capped by `maxDiscountMinor` and by the minimum charge.
 */
export function discountFor(amounts: OrderAmounts, discount: Discount): number {
  const raw = discount.kind === 'PERCENT' ? Math.round((amounts.subtotal * discount.value) / 100) : discount.value;
  const capped = discount.maxDiscountMinor === null ? raw : Math.min(raw, discount.maxDiscountMinor);
  return Math.max(0, Math.min(capped, amounts.total - MIN_CHARGE_MINOR));
}

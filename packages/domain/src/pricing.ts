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

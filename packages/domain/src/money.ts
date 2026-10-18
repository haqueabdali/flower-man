/**
 * Money is always an integer number of minor units (cents). €12.50 = 1250.
 * Never use floating point for amounts.
 */
export type MinorUnits = number;

export const CURRENCY = 'EUR';

export function assertMinorUnits(value: number, label = 'amount'): MinorUnits {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of cents, got ${String(value)}`);
  }
  return value;
}

/** Sum of integer amounts; throws on non-integers or unsafe results. */
export function sumMinor(values: readonly number[]): MinorUnits {
  let total = 0;
  for (const value of values) {
    total += assertMinorUnits(value);
  }
  return assertMinorUnits(total, 'total');
}

export function multiplyMinor(unitPrice: number, quantity: number): MinorUnits {
  assertMinorUnits(unitPrice, 'unit price');
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError('quantity must be a non-negative integer');
  }
  return assertMinorUnits(unitPrice * quantity, 'line total');
}

/**
 * Percentage expressed in basis points (1500 = 15%) of an amount, rounded half-up to the cent.
 * Integer-only arithmetic: no floating point is involved.
 */
export function basisPointsOf(amount: number, basisPoints: number): MinorUnits {
  assertMinorUnits(amount);
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new RangeError('basis points must be an integer between 0 and 10000');
  }
  const sign = amount < 0 ? -1 : 1;
  const absolute = Math.abs(amount);
  return sign * Math.floor((absolute * basisPoints + 5_000) / 10_000);
}

/** €12.50 for 1250. Display only; never parse this back. */
export function formatEuro(amount: number, locale = 'it-IT'): string {
  assertMinorUnits(amount);
  const sign = amount < 0 ? '-' : '';
  const absolute = Math.abs(amount);
  const euros = Math.floor(absolute / 100);
  const cents = String(absolute % 100).padStart(2, '0');
  const separator = locale.startsWith('it') ? ',' : '.';
  return `${sign}€${euros}${separator}${cents}`;
}

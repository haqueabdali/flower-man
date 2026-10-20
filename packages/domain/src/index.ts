/**
 * @flower-man/domain
 *
 * Framework-independent domain types and rules.
 * Must not import NestJS, React, React Native or database code.
 */

/** Nominal typing helper, e.g. type UserId = Brand<string, 'UserId'>. */
export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

/** Exhaustiveness guard for switch statements over unions (e.g. state machines). */
export function assertNever(value: never, message = 'Unhandled value'): never {
  // Never JSON-serialize the value: it could carry secrets into logs.
  const detail =
    typeof value === 'object' && value !== null
      ? Object.prototype.toString.call(value)
      : String(value);
  throw new Error(`${message}: ${detail}`);
}

export * from './delivery.js';
export * from './hours.js';
export * from './money.js';
export * from './order.js';
export * from './partner.js';
export * from './pricing.js';
export * from './settlement.js';
export * from './state-machine.js';

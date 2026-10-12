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
  throw new Error(`${message}: ${String(value)}`);
}

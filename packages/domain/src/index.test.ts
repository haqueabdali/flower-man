import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNever } from './index.js';

describe('assertNever', () => {
  it('throws with the unhandled primitive value', () => {
    assert.throws(() => assertNever('PAID' as never), /Unhandled value: PAID/);
  });

  it('uses a custom message', () => {
    assert.throws(() => assertNever(42 as never, 'Unknown status'), /Unknown status: 42/);
  });

  it('never serializes object contents (they may hold secrets)', () => {
    assert.throws(
      () => assertNever({ password: 'hunter2' } as never),
      (error: unknown) => error instanceof Error && error.message === 'Unhandled value: [object Object]',
    );
  });

  it('handles null-prototype objects without a TypeError', () => {
    assert.throws(() => assertNever(Object.create(null) as never), /Unhandled value: \[object Object\]/);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  it('allows up to the limit per key and window, then blocks', () => {
    let now = 0;
    const limiter = new RateLimiter(3, 60_000, () => now);
    assert.deepEqual([1, 2, 3, 4].map(() => limiter.consume('a').allowed), [true, true, true, false]);
    assert.equal(limiter.consume('b').allowed, true);

    now = 30_000;
    const blocked = limiter.consume('a');
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 30);

    now = 60_000;
    assert.equal(limiter.consume('a').allowed, true);
  });
});

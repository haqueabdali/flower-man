import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MemoryRateLimiter } from './rate-limiter.js';

describe('MemoryRateLimiter', () => {
  it('allows up to the limit per key and window, then blocks', async () => {
    let now = 0;
    const limiter = new MemoryRateLimiter(3, 60_000, () => now);
    const results = [];
    for (let i = 0; i < 4; i += 1) {
      results.push((await limiter.consume('a')).allowed);
    }
    assert.deepEqual(results, [true, true, true, false]);
    assert.equal((await limiter.consume('b')).allowed, true);

    now = 30_000;
    const blocked = await limiter.consume('a');
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 30);

    now = 60_000;
    assert.equal((await limiter.consume('a')).allowed, true);
  });
});

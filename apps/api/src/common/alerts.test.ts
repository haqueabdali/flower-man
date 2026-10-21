import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Alerter } from './alerts.js';

describe('Alerter', () => {
  it('posts { text } and throttles repeats and floods', async () => {
    let now = 0;
    const sent: { url: string; body: string }[] = [];
    const alerter = new Alerter('https://hooks.example.com/x', 'flower-man-api 1.0.0 (production)', async (url, body) => sent.push({ url, body }), () => now);
    assert.equal(alerter.report('GET /orders 500', 'Internal error'), true);
    assert.equal(alerter.report('GET /orders 500', 'Internal error'), false, 'same alert within 5 minutes');
    now = 5 * 60_000;
    assert.equal(alerter.report('GET /orders 500', 'Internal error'), true);
    for (let i = 0; i < 30; i += 1) alerter.report(`key ${i}`, 'x');
    assert.equal(sent.length, 20, 'at most 20 per hour');
    assert.deepEqual(JSON.parse(sent[0]?.body ?? '{}'), { text: '⚠️ flower-man-api 1.0.0 (production): Internal error' });
  });

  it('does nothing without a webhook', () => {
    assert.equal(new Alerter(null, 'api').report('k', 'm'), false);
  });
});

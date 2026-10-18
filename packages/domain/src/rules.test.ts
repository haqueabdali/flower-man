import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertDeliveryTransition,
  assertOrderTransition,
  assertSettlementTransition,
  assertVerificationTransition,
  basisPointsOf,
  calculateOrderAmounts,
  canTransitionOrder,
  formatEuro,
  multiplyMinor,
  sumMinor,
  TransitionError,
} from './index.js';

describe('money', () => {
  it('rounds commission half-up with integers only', () => {
    assert.equal(basisPointsOf(1250, 1500), 188); // 187.5 → 188
    assert.equal(basisPointsOf(1000, 1500), 150);
    assert.equal(basisPointsOf(1, 1500), 0);
    assert.equal(basisPointsOf(-1250, 1500), -188);
    assert.equal(basisPointsOf(999, 0), 0);
  });

  it('rejects non-integer amounts', () => {
    assert.throws(() => sumMinor([10, 0.5]), RangeError);
    assert.throws(() => multiplyMinor(12.5, 2), RangeError);
    assert.throws(() => basisPointsOf(100, 10_001), RangeError);
  });

  it('formats euros', () => {
    assert.equal(formatEuro(1250), '€12,50');
    assert.equal(formatEuro(5, 'en'), '€0.05');
    assert.equal(formatEuro(-300), '-€3,00');
  });

  it('calculates authoritative order amounts', () => {
    const amounts = calculateOrderAmounts(
      [
        { unitPrice: 2990, quantity: 2 },
        { unitPrice: 450, quantity: 1 },
      ],
      590,
      1500,
    );
    assert.deepEqual(amounts, { subtotal: 6430, deliveryFee: 590, total: 7020, platformCommission: 965, sellerNet: 5465 });
    assert.throws(() => calculateOrderAmounts([], 590, 1500), RangeError);
  });
});

describe('order state machine', () => {
  it('allows the happy path only for the right actors', () => {
    assert.equal(canTransitionOrder('PENDING_PAYMENT', 'PAID', 'SYSTEM'), true);
    assert.equal(canTransitionOrder('PENDING_PAYMENT', 'PAID', 'CUSTOMER'), false, 'clients never mark payments');
    assert.equal(canTransitionOrder('PAID', 'CONFIRMED', 'SELLER'), true);
    assert.equal(canTransitionOrder('PAID', 'CONFIRMED', 'CUSTOMER'), false);
    assert.equal(canTransitionOrder('IN_TRANSIT', 'DELIVERED', 'SYSTEM'), true);
  });

  it('rejects skipping steps and leaving terminal states', () => {
    assert.throws(() => assertOrderTransition('PAID', 'DELIVERED', 'ADMIN'), TransitionError);
    assert.throws(() => assertOrderTransition('DELIVERED', 'CANCELLED', 'ADMIN'), TransitionError);
    assert.throws(() => assertOrderTransition('REFUNDED', 'PAID', 'SYSTEM'), TransitionError);
    assert.throws(() => assertOrderTransition('PICKED_UP', 'CANCELLED', 'CUSTOMER'), TransitionError);
  });
});

describe('other state machines', () => {
  it('delivery: courier drives the lifecycle in order', () => {
    assert.doesNotThrow(() => assertDeliveryTransition('OFFERED', 'ASSIGNED', 'COURIER'));
    assert.throws(() => assertDeliveryTransition('ASSIGNED', 'DELIVERED', 'COURIER'), TransitionError);
    assert.throws(() => assertDeliveryTransition('PICKED_UP', 'IN_TRANSIT', 'CUSTOMER'), TransitionError);
  });

  it('verification: partners submit, only admins approve', () => {
    assert.doesNotThrow(() => assertVerificationTransition('DRAFT', 'SUBMITTED', true));
    assert.throws(() => assertVerificationTransition('SUBMITTED', 'APPROVED', true), TransitionError);
    assert.doesNotThrow(() => assertVerificationTransition('SUBMITTED', 'APPROVED', false));
  });

  it('settlement: PAID is final', () => {
    assert.doesNotThrow(() => assertSettlementTransition('PROCESSING', 'PAID'));
    assert.throws(() => assertSettlementTransition('PAID', 'FAILED'), TransitionError);
    assert.throws(() => assertSettlementTransition('CREATED', 'PAID'), TransitionError);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isSensitiveKey } from './index.js';

describe('isSensitiveKey', () => {
  const sensitive = [
    'password',
    'newPassword',
    'PASSWORD_HASH',
    'passwd',
    'pwd',
    'refresh_token',
    'accessToken',
    'Authorization',
    'x-api-key',
    'apiKey',
    'stripeSecretKey',
    'clientSecret',
    'set-cookie',
    'sessionId',
    'jwt',
    'credentials',
    'privateKey',
    'cardNumber',
    'cvc',
    'cvv',
    'securityCode',
    'iban',
    'DATABASE_URL',
    'connectionString',
    'expoPushToken',
  ];
  for (const key of sensitive) {
    it(`treats "${key}" as sensitive`, () => assert.equal(isSensitiveKey(key), true));
  }

  const safe = ['email', 'name', 'phone', 'orderId', 'status', 'deliveryAddress', 'amountMinor', 'currency', 'zoneId'];
  for (const key of safe) {
    it(`treats "${key}" as safe`, () => assert.equal(isSensitiveKey(key), false));
  }
});

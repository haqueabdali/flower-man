import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { hashPassword, verifyPassword } from './password.js';

describe('password hashing (scrypt)', () => {
  it('verifies the correct password and rejects others', async () => {
    const hash = await hashPassword('correct horse battery staple');
    assert.match(hash, /^scrypt\$131072\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    assert.equal(await verifyPassword('correct horse battery staple', hash), true);
    assert.equal(await verifyPassword('correct horse battery stapl', hash), false);
    assert.equal(await verifyPassword('', hash), false);
  });

  it('salts every hash', async () => {
    assert.notEqual(await hashPassword('same password 123'), await hashPassword('same password 123'));
  });

  it('treats Unicode-equivalent passwords as equal (NFKC)', async () => {
    const hash = await hashPassword('Città fiorita 2026');
    assert.equal(await verifyPassword('Città fiorita 2026', hash), true);
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
    assert.equal(await verifyPassword('anything', 'bcrypt$10$abc'), false);
  });
});

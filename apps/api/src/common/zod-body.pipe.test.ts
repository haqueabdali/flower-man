import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { registerRequestSchema } from '@flower-man/contracts';
import { BadRequestException } from '@nestjs/common';

import { ZodBodyPipe } from './zod-body.pipe.js';

describe('ZodBodyPipe', () => {
  const pipe = new ZodBodyPipe(registerRequestSchema);

  it('returns the parsed, trimmed value', () => {
    const value = pipe.transform({ email: '  Ada@Example.com ', password: 'long enough pw', fullName: ' Ada Lovelace ' });
    assert.deepEqual(value, { email: 'Ada@Example.com', password: 'long enough pw', fullName: 'Ada Lovelace' });
  });

  it('lists every problem with its field', () => {
    assert.throws(
      () => pipe.transform({ email: 'nope', password: 'short', fullName: 'A', isAdmin: true }),
      (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        const message = (error.getResponse() as { message: string[] }).message;
        assert.ok(message.some((m) => m.startsWith('email:')));
        assert.ok(message.some((m) => m.startsWith('password:')));
        assert.ok(message.some((m) => m.startsWith('fullName:')));
        assert.ok(message.some((m) => m.includes('isAdmin')), 'unknown keys are rejected (no mass assignment)');
        return true;
      },
    );
  });

  it('rejects a non-object body', () => {
    assert.throws(() => pipe.transform('text'), BadRequestException);
  });
});

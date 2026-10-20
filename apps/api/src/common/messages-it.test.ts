import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

import { registerRequestSchema } from '@flower-man/contracts';

import { localizeError, wantsItalian } from './api-exception.filter.js';
import { translateToItalian } from './messages-it.js';
import { ZodBodyPipe } from './zod-body.pipe.js';

// dist-test/common → repository root
const ROOT = resolve(import.meta.dirname, '../../../..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.ts$/.test(entry.name) && !/\.(test|integration)\.ts$/.test(entry.name) ? [path] : [];
  });
}

/** Every literal message a client can receive: HTTP exception texts (direct or via constants) and contract custom messages. */
function clientMessages(): string[] {
  const messages = new Set<string>();
  for (const file of sourceFiles(join(ROOT, 'apps/api/src'))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/[A-Z][A-Za-z]*Exception\(\s*'((?:\\.|[^'\\])*)'/g)) messages.add(match[1] as string);
    for (const match of source.matchAll(/[A-Z][A-Za-z]*Exception\(\s*([A-Z][A-Z_]+)\s*[,)]/g)) {
      const constant = new RegExp(`const ${match[1]} = '((?:\\\\.|[^'\\\\])*)'`).exec(source)?.[1];
      if (constant) messages.add(constant);
    }
  }
  for (const file of sourceFiles(join(ROOT, 'packages/contracts/src'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/message: '((?:\\.|[^'\\])*)'/g)) messages.add(match[1] as string);
  }
  return [...messages].map((message) => message.replace(/\\'/g, "'"));
}

describe('Italian API messages', () => {
  it('has a translation for every client-facing message in the source', () => {
    const messages = clientMessages();
    assert.ok(messages.length > 80, `found only ${messages.length} messages: the scan is broken`);
    const missing = messages.filter((message) => translateToItalian(message) === message);
    assert.deepEqual(missing, [], 'add these to apps/api/src/common/messages-it.ts');
  });

  it('translates messages built with values', () => {
    assert.equal(translateToItalian('Only 3 left in stock.'), 'Ne restano solo 3.');
    assert.equal(translateToItalian('Prices changed: the total is now €65.70. Please review your cart.'), 'I prezzi sono cambiati: il totale ora è 65,70 €. Controlla il carrello.');
    assert.equal(translateToItalian('order cannot go from PAID to DELIVERED (requested by SELLER).'), 'Operazione non possibile: da "pagato" a "consegnato".');
    assert.equal(translateToItalian('Something new'), 'Something new');
  });

  it('reads the first language of Accept-Language', () => {
    assert.equal(wantsItalian('it-IT,it;q=0.9,en;q=0.8'), true);
    assert.equal(wantsItalian('it'), true);
    assert.equal(wantsItalian('en-GB,it;q=0.5'), false);
    assert.equal(wantsItalian('ita'), false);
    assert.equal(wantsItalian(undefined), false);
  });

  it('renders validation errors in Italian, including custom contract messages', () => {
    let thrown: unknown;
    try {
      new ZodBodyPipe(registerRequestSchema).transform({ email: 'not-an-email', password: 'short', fullName: 'A' });
    } catch (error) {
      thrown = error;
    }
    const message = localizeError(thrown, 'ignored', 'it-IT');
    assert.match(message, /email: Inserisci un indirizzo email valido\./);
    assert.match(message, /password: /);
    assert.doesNotMatch(message, /Too small|Invalid/);
    assert.equal(localizeError(thrown, 'english text', 'en'), 'english text');
  });
});

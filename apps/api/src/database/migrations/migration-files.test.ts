import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { MigrationError } from './migration-error.js';
import {
  computeChecksum,
  parseMigrationFile,
  readMigrationFiles,
  validateSequence,
} from './migration-files.js';

const isMigrationError = (pattern: RegExp) => (error: unknown) => {
  assert.ok(error instanceof MigrationError, `expected MigrationError, got ${String(error)}`);
  assert.match(error.message, pattern);
  return true;
};

describe('parseMigrationFile', () => {
  it('parses version, name and checksum', () => {
    const file = parseMigrationFile('0002_create_users.sql', 'CREATE TABLE users (id int);\n');
    assert.equal(file.version, 2);
    assert.equal(file.name, 'create_users');
    assert.equal(file.filename, '0002_create_users.sql');
    assert.match(file.checksum, /^[0-9a-f]{64}$/);
  });

  it('gives identical checksums for LF, CRLF and BOM-prefixed content', () => {
    const lf = parseMigrationFile('0001_a.sql', 'SELECT 1;\nSELECT 2;\n');
    const crlf = parseMigrationFile('0001_a.sql', 'SELECT 1;\r\nSELECT 2;\r\n');
    const bom = parseMigrationFile('0001_a.sql', '﻿SELECT 1;\nSELECT 2;\n');
    assert.equal(crlf.checksum, lf.checksum);
    assert.equal(bom.checksum, lf.checksum);
    assert.equal(crlf.sql, lf.sql);
  });

  it('detects any content change through the checksum', () => {
    assert.notEqual(computeChecksum('SELECT 1;'), computeChecksum('SELECT 1; '));
  });

  for (const name of ['1_init.sql', '0001-init.sql', '0001_Init.sql', '0001_init.SQL', '0001_.sql', '0001_init__x.sql', 'init.sql']) {
    it(`rejects file name ${name}`, () => {
      assert.throws(() => parseMigrationFile(name, 'SELECT 1;'), isMigrationError(/Invalid migration file name/));
    });
  }

  it('rejects version 0000', () => {
    assert.throws(() => parseMigrationFile('0000_init.sql', 'SELECT 1;'), isMigrationError(/start at 0001/));
  });

  it('rejects empty files', () => {
    assert.throws(() => parseMigrationFile('0001_init.sql', ' \n\t\n'), isMigrationError(/is empty/));
  });

  for (const statement of ['BEGIN;', 'begin ;', 'START TRANSACTION;', 'COMMIT;', '  commit', 'ROLLBACK;']) {
    it(`rejects transaction control "${statement.trim()}"`, () => {
      assert.throws(
        () => parseMigrationFile('0001_init.sql', `CREATE TABLE t (id int);\n${statement}\n`),
        isMigrationError(/transaction-control statement/),
      );
    });
  }

  it('accepts PL/pgSQL BEGIN ... END; blocks', () => {
    const sql = [
      'CREATE FUNCTION touch() RETURNS trigger LANGUAGE plpgsql AS $$',
      'BEGIN',
      '  NEW.updated_at := now();',
      '  RETURN NEW;',
      'END;',
      '$$;',
      'DO $$',
      'BEGIN',
      '  RAISE NOTICE \'ok\';',
      'END',
      '$$;',
    ].join('\n');
    assert.doesNotThrow(() => parseMigrationFile('0001_init.sql', sql));
  });
});

describe('validateSequence', () => {
  const file = (filename: string) => parseMigrationFile(filename, 'SELECT 1;');

  it('sorts contiguous versions', () => {
    const sorted = validateSequence([file('0002_b.sql'), file('0001_a.sql'), file('0003_c.sql')]);
    assert.deepEqual(sorted.map((f) => f.version), [1, 2, 3]);
  });

  it('accepts an empty directory', () => {
    assert.deepEqual(validateSequence([]), []);
  });

  it('rejects duplicate versions', () => {
    assert.throws(() => validateSequence([file('0001_a.sql'), file('0001_b.sql')]), isMigrationError(/Duplicate migration version/));
  });

  it('rejects gaps', () => {
    assert.throws(() => validateSequence([file('0001_a.sql'), file('0003_c.sql')]), isMigrationError(/expected 0002, found 0003_c.sql/));
  });

  it('rejects a sequence that does not start at 0001', () => {
    assert.throws(() => validateSequence([file('0002_b.sql')]), isMigrationError(/expected 0001/));
  });
});

describe('readMigrationFiles', () => {
  let directory: string;

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'flower-man-migrations-'));
  });

  after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('reads migrations in version order and ignores README.md and .gitkeep', async () => {
    await writeFile(join(directory, '0002_second.sql'), 'SELECT 2;\r\n');
    await writeFile(join(directory, '0001_first.sql'), 'SELECT 1;\n');
    await writeFile(join(directory, 'README.md'), '# docs');
    await writeFile(join(directory, '.gitkeep'), '');
    const files = await readMigrationFiles(directory);
    assert.deepEqual(files.map((f) => f.filename), ['0001_first.sql', '0002_second.sql']);
    assert.equal(files[1]?.sql, 'SELECT 2;\n');
  });

  it('rejects unexpected files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flower-man-migrations-'));
    try {
      await writeFile(join(dir, 'notes.txt'), 'x');
      await assert.rejects(readMigrationFiles(dir), isMigrationError(/Invalid migration file name "notes.txt"/));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects subdirectories', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'flower-man-migrations-'));
    try {
      await mkdir(join(dir, 'old'));
      await assert.rejects(readMigrationFiles(dir), isMigrationError(/Unexpected entry "old"/));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports a missing directory clearly', async () => {
    await assert.rejects(readMigrationFiles(join(directory, 'does-not-exist')), isMigrationError(/Cannot read migrations directory .*ENOENT/));
  });
});

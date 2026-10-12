import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MigrationError } from './migration-error.js';
import { parseMigrationFile } from './migration-files.js';
import { type AppliedMigration, planMigrations } from './migrator.js';

const files = [
  parseMigrationFile('0001_extensions.sql', 'CREATE EXTENSION IF NOT EXISTS postgis;'),
  parseMigrationFile('0002_users.sql', 'CREATE TABLE users (id int);'),
  parseMigrationFile('0003_orders.sql', 'CREATE TABLE orders (id int);'),
];

const appliedRow = (index: number, overrides: Partial<AppliedMigration> = {}): AppliedMigration => {
  const file = files[index];
  assert.ok(file);
  return {
    version: file.version,
    name: file.name,
    checksum: file.checksum,
    appliedAt: new Date('2026-01-01T00:00:00Z'),
    executionMs: 5,
    ...overrides,
  };
};

const isMigrationError = (pattern: RegExp) => (error: unknown) => {
  assert.ok(error instanceof MigrationError);
  assert.match(error.message, pattern);
  return true;
};

describe('planMigrations', () => {
  it('returns every file as pending on an empty database', () => {
    const plan = planMigrations(files, []);
    assert.deepEqual(plan.pending.map((f) => f.version), [1, 2, 3]);
  });

  it('returns only newer files as pending', () => {
    const plan = planMigrations(files, [appliedRow(0), appliedRow(1)]);
    assert.deepEqual(plan.pending.map((f) => f.version), [3]);
    assert.equal(plan.applied.length, 2);
  });

  it('returns nothing pending when up to date', () => {
    assert.equal(planMigrations(files, [appliedRow(0), appliedRow(1), appliedRow(2)]).pending.length, 0);
  });

  it('fails when an applied migration was edited', () => {
    assert.throws(
      () => planMigrations(files, [appliedRow(0, { checksum: 'f'.repeat(64) })]),
      isMigrationError(/0001_extensions.sql was modified after it was applied/),
    );
  });

  it('fails when an applied migration was renamed', () => {
    assert.throws(() => planMigrations(files, [appliedRow(0, { name: 'old_name' })]), isMigrationError(/must not be renamed/));
  });

  it('fails when an applied migration file is missing', () => {
    assert.throws(
      () => planMigrations(files.slice(0, 1), [appliedRow(0), appliedRow(1)]),
      isMigrationError(/0002_users is applied in the database but its file is missing/),
    );
  });

  it('fails when a pending migration is older than the latest applied one', () => {
    assert.throws(() => planMigrations(files, [appliedRow(0), appliedRow(2)]), isMigrationError(/0002_users.sql is older than/));
  });
});

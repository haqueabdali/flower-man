import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { MigrationError } from './migration-error.js';

export interface MigrationFile {
  readonly version: number;
  readonly name: string;
  readonly filename: string;
  /** File content with BOM removed and line endings normalized to LF. */
  readonly sql: string;
  /** SHA-256 (hex) of `sql`. Stored in schema_migrations to detect edits to applied migrations. */
  readonly checksum: string;
}

/** 0001_create_users.sql → version 1, name "create_users". */
const FILE_PATTERN = /^(\d{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

/** Non-migration files allowed in the migrations directory. */
const IGNORED_FILES = new Set(['README.md', '.gitkeep']);

/**
 * Every migration runs inside a transaction managed by the runner, so files must not
 * control transactions themselves. PL/pgSQL `BEGIN` / `END;` blocks (no `BEGIN;`) are fine.
 */
const TRANSACTION_CONTROL = /^\s*(?:begin\s*;|start\s+transaction\b|commit\b|rollback\b)/im;

export function normalizeSql(raw: string): string {
  return raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

export function computeChecksum(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

/**
 * Parses a migration file. Pure: no file system access.
 * Throws MigrationError for invalid names, empty files or transaction-control statements.
 */
export function parseMigrationFile(filename: string, raw: string): MigrationFile {
  const match = FILE_PATTERN.exec(filename);
  if (!match?.[1] || !match[2]) {
    throw new MigrationError(
      `Invalid migration file name "${filename}". Expected NNNN_snake_case_name.sql, e.g. 0002_create_users.sql.`,
    );
  }
  const version = Number.parseInt(match[1], 10);
  if (version < 1) {
    throw new MigrationError(`Invalid migration file name "${filename}". Versions start at 0001.`);
  }

  const sql = normalizeSql(raw);
  if (sql.trim() === '') {
    throw new MigrationError(`Migration ${filename} is empty.`);
  }
  if (TRANSACTION_CONTROL.test(sql)) {
    throw new MigrationError(
      `Migration ${filename} contains a transaction-control statement (BEGIN; / START TRANSACTION / COMMIT / ROLLBACK). ` +
        'The runner wraps every migration in its own transaction. Remove those statements.',
    );
  }

  return { version, name: match[2], filename, sql, checksum: computeChecksum(sql) };
}

/** Checks that versions are unique and contiguous from 1 (0001, 0002, ...). Returns them sorted. */
export function validateSequence(files: readonly MigrationFile[]): MigrationFile[] {
  const sorted = [...files].sort((a, b) => a.version - b.version);
  sorted.forEach((file, index) => {
    const expected = index + 1;
    if (file.version !== expected) {
      const previous = sorted[index - 1];
      if (previous && previous.version === file.version) {
        throw new MigrationError(
          `Duplicate migration version ${file.filename} and ${previous.filename}. Renumber the newer one.`,
        );
      }
      throw new MigrationError(
        `Migration versions must be contiguous: expected ${String(expected).padStart(4, '0')}, found ${file.filename}.`,
      );
    }
  });
  return sorted;
}

/** Reads, parses and validates every migration in `directory`, ordered by version. */
export async function readMigrationFiles(directory: string): Promise<MigrationFile[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'unknown error';
    throw new MigrationError(`Cannot read migrations directory ${directory} (${code}).`);
  }

  const files: MigrationFile[] = [];
  for (const entry of entries) {
    if (IGNORED_FILES.has(entry.name)) {
      continue;
    }
    if (!entry.isFile()) {
      throw new MigrationError(`Unexpected entry "${entry.name}" in ${directory}. Only migration files are allowed.`);
    }
    const raw = await readFile(join(directory, entry.name), 'utf8');
    files.push(parseMigrationFile(entry.name, raw));
  }
  return validateSequence(files);
}

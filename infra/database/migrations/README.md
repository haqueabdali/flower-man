# Database migrations

Plain SQL files applied in order by `pnpm db:migrate` (runner: `apps/api/src/database/migrate.ts`).

## Rules

1. **Name:** `NNNN_snake_case_name.sql`, for example `0002_create_users.sql`.
   Versions are contiguous from `0001`: take the next free number.
2. **Never edit, rename or delete an applied migration.** The runner stores a SHA-256 checksum
   and stops if an applied file changes. Fix mistakes with a **new** migration.
3. **No `BEGIN;` / `COMMIT` / `ROLLBACK`.** Each file runs in its own transaction together with
   its `schema_migrations` row. PL/pgSQL `BEGIN ... END;` blocks are fine.
   A failing migration rolls back completely and later files are not attempted.
4. **Lock timeout:** each migration runs with `lock_timeout = 30s`, so a blocked `ALTER TABLE`
   fails instead of stalling the application.
5. Use `SET LOCAL` (not `SET`) inside a migration: a plain `SET` would leak into later migrations of the same run.
6. Create every extension you use (`CREATE EXTENSION IF NOT EXISTS ...`). The local Docker
   database starts without any.

## Commands

```bash
pnpm db:migrate          # apply pending migrations
pnpm db:migrate:status   # list applied and pending migrations
```

History table: `public.schema_migrations` (version, name, checksum, applied_at, execution_ms, applied_by).
Concurrent runs are serialized with a PostgreSQL advisory lock.

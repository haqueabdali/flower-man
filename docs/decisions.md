# Architecture Decision Log

Short records of decisions that later milestones must respect.
Never rewrite an accepted decision: add a new one that supersedes it.

## ADR-001: pnpm 11 workspace monorepo (Milestone 1)

- pnpm `11.19.0` is pinned via `packageManager`. Do not upgrade to pnpm 12 (Rust port) without a dedicated decision.
- Workspace settings live in `pnpm-workspace.yaml`. In pnpm 11, `.npmrc` is only for auth and registry settings.
- Shared versions use the pnpm **catalog** (`"typescript": "catalog:"`).
- Internal dependencies use `"workspace:*"`.
- Supply-chain policy: `minimumReleaseAge: 1440` (24h) with `minimumReleaseAgeStrict: true`.
  This is stricter than pnpm's default loose mode, which silently adds immature versions to `minimumReleaseAgeExclude`.
  `strictDepBuilds: true`: a dependency's install script is only allowed after review, by adding it to `allowBuilds`.

## ADR-002: TypeScript 6.0.x, strict (Milestone 1)

- `typescript ~6.0.3`. Expo SDK 57's template pins `typescript ~6.0.3`, and Nest CLI 12 depends on `~6.0.2`.
  TypeScript 7 (the native port) is deferred until the whole toolchain supports it.
- `tsconfig.base.json` holds strictness and shared language settings (target, lib, types), but no `module`/`moduleResolution`. Each project chooses its module system:
  - packages and API: `NodeNext`
  - Next.js and Expo: `Bundler`
- TypeScript 6 defaults `types` to `[]`. Projects opt in explicitly (for example, the API uses `"types": ["node"]`).
- No unnecessary `any`. No `@ts-ignore` unless there is an exceptional, documented reason.
- `noPropertyAccessFromIndexSignature` stays on. Each app declares the environment variables it reads in `src/env.d.ts`
  (`declare global { namespace NodeJS { interface ProcessEnv { readonly PORT?: string } } } export {};`)
  and reads them with dot notation (`process.env.EXPO_PUBLIC_API_URL`).
  Never use `process.env['X']`: Expo and Next.js only inline dot access.

## ADR-003: ESM-only shared packages, built to `dist/` (Milestone 1)

- NestJS 12 is ESM-only (`"type": "module"`), so the API and every shared package are ESM.
- Shared packages compile with `tsc` to `dist/` and expose it through `exports` (`types` + `default`).
  Node (API), Metro (Expo) and Next.js all consume the same built JavaScript.
- Consumers therefore need `pnpm build:core` before they typecheck, run or build. `pnpm typecheck` does this automatically.
  Hosted builds need the same step. Each Expo app gets `"eas-build-post-install": "pnpm --dir ../.. run build:core"` when it is scaffolded,
  and CI or hosted admin builds run `pnpm build:core` before `next build`.
- Relative imports inside packages use explicit `.js` extensions (NodeNext rule).
- `packages/contracts` and `packages/domain` must not import Node-only, NestJS or React modules.
- The Expo apps do **not** set `"type": "module"`: `babel.config.js`, `metro.config.js` and Expo template scripts are CommonJS.

## ADR-004: Windows-compatible tooling (Milestone 1)

- The primary development machine is Windows with Git Bash. pnpm runs package scripts with `cmd.exe` on Windows, so:
  - package scripts use only `&&` chaining and double quotes;
  - there is no `rm -rf`: file operations go through Node scripts in `scripts/` (for example `scripts/clean.mjs`);
  - `build:core` uses `--fail-if-no-match`, so a path filter that matches nothing fails instead of silently skipping the build.
- `.gitattributes` forces LF line endings (`* text=auto eol=lf`), overriding Git for Windows' `core.autocrlf=true`.

## ADR-005: Local PostgreSQL host port 55432 (Milestone 0)

- Chosen to avoid a native PostgreSQL on 5432.
- 55432 is inside Windows' dynamic port range (49152-65535). Hyper-V/WSL2 may reserve blocks of it.
  If Docker reports `Ports are not available`, check `netsh interface ipv4 show excludedportrange protocol=tcp`,
  then move the host port (for example 15432) with a new ADR. The container port stays 5432.

## ADR-006: Local PostgreSQL 17 + PostGIS via Docker Compose (Milestone 2)

- Image: `postgis/postgis:17-3.6-alpine` (PostgreSQL 17.11, PostGIS 3.6.4 when adopted).
  The Debian tag `17-3.5` was rejected: it still ships PostgreSQL 17.5 on Debian 11 (end of life).
- Compose project `flower-man`, service `db`, named volume `flower-man_db-data`. `pnpm db:down` never removes the volume.
- The port is published on `127.0.0.1:55432` only, so the database is not reachable from the local network.
  If Hyper-V/WinNAT has reserved a range containing 55432, the preferred remedy is to reserve 55432 for us
  (README → Troubleshooting) rather than moving the port as ADR-005 suggests. Moving it remains the last resort.
- The health check uses TCP (`pg_isready -h 127.0.0.1`), so `docker compose up --wait` only returns once
  first-time initialization has finished.
- Encoding UTF8 with PostgreSQL 17's built-in `C.UTF-8` collation (`--locale-provider=builtin`).
  It sorts and compares identically on any OS and is unaffected by OS library upgrades, but only in databases created with it.
  Production must create its database the same way:
  `CREATE DATABASE ... TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'C.UTF-8'`.
  A pre-created libc/ICU database changes `ORDER BY` results and `LIKE 'prefix%'` index use.
  Where Italian linguistic ordering is needed, queries use an explicit ICU collation.
- Server timezone UTC. Timestamps are stored as `timestamptz`; conversion to Europe/Rome happens at the edges.
- The image's init script (`/docker-entrypoint-initdb.d/10_postgis.sh`) is replaced by an empty one via a Compose `config`.
  Otherwise it would install postgis, postgis_topology, the tiger geocoder and fuzzystrmatch, create `template_postgis`
  and change the database `search_path`. The dev database therefore starts clean, like a new production database,
  and migrations create every extension they need (`CREATE EXTENSION IF NOT EXISTS postgis`).
  `pnpm db:check` shows `postgis_available` (in the image) and `postgis_installed` (created by migrations, from Milestone 3).
- Compose credentials (`flower_man`/`flower_man`) are for local development only.
  Production uses `DATABASE_URL` and `DATABASE_SSL=true` from the environment.

## ADR-007: Plain-SQL migrations with a small in-house runner (Milestone 3)

- No ORM and no migration framework. Numbered SQL files in `infra/database/migrations/` (`NNNN_snake_case.sql`,
  contiguous from 0001) are applied by `apps/api/src/database/migrate.ts` (`pnpm db:migrate`).
  The runner lives in the API so production deploys run it from the same build.
- History table `public.schema_migrations` stores version, name, SHA-256 checksum (of LF-normalized content),
  applied_at, execution_ms and applied_by.
- Applied migrations are immutable. The runner refuses to run if an applied file was edited, renamed or deleted,
  or if a new file is numbered below the latest applied one.
- Each migration runs in its own transaction together with its history row. Transaction-control statements in files
  (`BEGIN;`, `COMMIT`, `ROLLBACK`, `ABORT`, `END TRANSACTION`, ...) are rejected before anything runs. After each file,
  the runner also checks that the transaction ID is unchanged (this catches `END;`, `COMMIT AND CHAIN`, ...), and refuses
  to record the migration otherwise.
  A session advisory lock serializes concurrent runners. `lock_timeout = 30s`.
- `RESET ALL` + `RESET ROLE` run before each file, so session settings never leak between migrations
  (one run and several runs produce the same schema). `search_path` is deliberately not pinned to `public`:
  some hosts install PostGIS in an `extensions` schema on the role's search path.
- Migration files must be valid UTF-8 (rejected otherwise, so Italian text is never silently corrupted).
- Not supported yet: statements that cannot run in a transaction (e.g. `CREATE INDEX CONCURRENTLY`).
  Add an explicit opt-out with its own ADR when first needed.
- `DATABASE_SSL` is the only TLS switch: `true` means TLS with certificate verification (`rejectUnauthorized: true`).
  Any `ssl*` parameter in `DATABASE_URL` is rejected, because the pg driver lets it silently override the ssl option
  (e.g. `?sslmode=disable` turns TLS off). `NODE_ENV=production` requires `DATABASE_SSL=true`.
  A custom CA (some managed providers) will be added as a separate variable when production is configured.
- Connection strings are never logged. Only `host:port/database`, as resolved by the pg driver, is printed.
  URLs with unencoded special characters in the password (which would move part of it into the host or path)
  or invalid percent-encoding are rejected.

## ADR-008: Tests use Node's built-in test runner (Milestone 3)

- `node:test` + `node:assert/strict`, with tests written in TypeScript and compiled by `tsc` (`tsconfig.test.json` → `dist-test/`).
  There are no extra dependencies, it is ESM-native, and `tsc` emits decorator metadata, so NestJS tests work the same way later.
- `*.test.ts` files are unit tests (`pnpm test`, no external services).
  `*.integration.ts` files are integration tests (`pnpm test:integration`, need `pnpm db:up`).
  Integration tests create a throwaway database per test (`flower_man_it_*`, UTF8 + builtin C.UTF-8) and drop it. They never touch the dev database.
- Shared packages typecheck tests with Node types (`tsconfig.json`), but build with `"types": []` (`tsconfig.build.json`),
  so shipped package code cannot use Node-only APIs.
- The mobile and web apps may adopt their framework's test tooling (jest-expo, etc.) in their own milestones.

## ADR-009: API foundation (Milestone 4a)

- NestJS 12 on Express 5 (`@nestjs/platform-express`), ESM, legacy decorators + `emitDecoratorMetadata`, compiled by `tsc`.
  There is no Nest CLI: `pnpm dev:api` runs `tsc --watch` + `node --watch` (`apps/api/scripts/dev.mjs`).
- `createApp(config)` (`app.factory.ts`) builds the app for both `main.ts` and the integration tests, so tests exercise the real setup.
- Configuration is validated before Nest starts (`loadAppConfig`). An invalid config prints one line and exits 1.
  Variables: `NODE_ENV`, `HOST` (127.0.0.1), `PORT` (4000), `CORS_ORIGINS`, `TRUST_PROXY`, `APP_VERSION`, `DATABASE_URL`, `DATABASE_SSL`.
- All routes are under `/api/v1` (contracts: `API_GLOBAL_PREFIX` / `API_VERSION`).
- Security baseline:
  - `helmet` default headers; `x-powered-by` disabled;
  - JSON body limit 100 kB;
  - CORS only for exact origins in `CORS_ORIGINS`. No wildcard, https-only in production, no credentials (bearer tokens);
  - `trust proxy` is off unless `TRUST_PROXY` gives the hop count.
- Every response carries `X-Request-Id`. A client value is accepted only if it matches `[A-Za-z0-9._-]{8,128}`.
  The access log has method, path (no query string), status, duration and request ID. Bodies are never logged.
- Errors always use the `ApiErrorResponse` shape `{ error: { code, message, requestId } }` from contracts.
  5xx messages are generic. Details and stacks go to the server log only.
- Database access uses one `pg.Pool` per process (`PG_POOL`): max 10 connections, `statement_timeout` 15s,
  `idle_in_transaction_session_timeout` 60s, client `query_timeout` 20s. The pool is closed on shutdown (SIGTERM/SIGINT).
- `GET /api/v1/health` returns 200 `{status:"ok"}` or 503 `{status:"down"}` with `checks.database`, plus `Cache-Control: no-store`.
- Input validation (shared schemas in `@flower-man/contracts`) arrives with the first endpoint that accepts input (Milestone 4b).

## ADR-010: Identity and authentication (Milestone 4b)

- Tables (`0002_identity.sql`):
  - `users`: email unique case-insensitively via `email_normalized`; status `ACTIVE | SUSPENDED | DELETED`;
  - `user_credentials`: password hash kept apart from profile data;
  - `user_capabilities`: a user may hold several capabilities;
  - `auth_sessions`: one per signed-in device;
  - `auth_refresh_tokens`: SHA-256 hashes only;
  - `security_events`: append-only, enforced by a trigger.
- Passwords: scrypt from `node:crypto` (N=2^17, r=8, p=1, 16-byte salt, 64-byte key), with parameters stored in each hash.
  The `argon2` package was not used because it needs a native install script (supply-chain rule in ADR-001).
  Passwords are NFKC-normalized. Length is 10 to 128 characters. Unknown emails still run a dummy hash, so timing does not reveal accounts.
- Tokens:
  - access token: JWT HS256 via `jose` (iss `flower-man-api`, aud `flower-man`, `sub` = user, `sid` = session), 15 minutes,
    sent as `Authorization: Bearer`. `AUTH_ACCESS_TOKEN_SECRET` must be at least 32 characters, and the `.env.example` value is refused in production;
  - refresh token: opaque 256-bit random value, single use, rotated on every refresh. Replaying a used one revokes the whole session.
    Sessions end 30 days after sign-in at the latest (refresh never extends them).
- `AuthGuard` loads the session and user on **every** request (one query). Logout, suspension, revocation and capability changes
  therefore apply immediately, not when the access token expires.
- Authorization: `@UseGuards(AuthGuard)` + `@RequireCapabilities(...)` (any of the listed). It is enforced by the API only.
- Registration grants `CUSTOMER`. Partner capabilities come with onboarding (Milestone 7); platform roles come from the
  bootstrap (Milestone 5) or an admin.
- Login responses: wrong password and unknown email both get the same 401. A suspended account gets 403 only after the correct password.
  Registering an existing email gets 409, which deliberately reveals the email is taken: users need it to recover, and the rate limits cap probing.
- Rate limits (in-memory, per API process): login 10 per account and 50 per IP per 15 minutes, registration 10 per IP per hour,
  refresh 60 per IP per minute; over the limit gets 429 + `Retry-After`. **A shared store (PostgreSQL or Redis) is required
  before running more than one API instance.**
- Request bodies are validated with the shared zod schemas from `@flower-man/contracts` (`ZodBodyPipe`).
  Unknown fields are rejected, which prevents mass assignment (e.g. sending `capabilities`).
- Not in 4b: email verification and password recovery (Milestone 4c, which needs email delivery),
  account deletion requests (privacy milestone) and per-account lockout notifications.

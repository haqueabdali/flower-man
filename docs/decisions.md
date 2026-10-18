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
- Not in 4b: email verification and password recovery (Milestone 4c, see ADR-011),
  account deletion requests (privacy milestone) and per-account lockout notifications.

## ADR-011: Email verification and password recovery (Milestone 4c)

- `auth_action_tokens` (`0003_account_recovery.sql`): single-use, 256-bit random tokens stored as SHA-256 hashes,
  each with a purpose (`EMAIL_VERIFICATION`, valid 24h; `PASSWORD_RESET`, valid 30 min) and the address it was sent to.
  Issuing a new token invalidates older unused ones of the same purpose. A token of one purpose never works for the other.
- Emails contain links `${EMAIL_LINK_BASE_URL}/verify-email?token=…` and `/reset-password?token=…`. The apps / web page
  will handle these paths (deep links come with the mobile milestones). Until then the token can be posted to the API directly.
- Registration sends the verification email automatically. Signing in does not require a verified email: features that
  need it (e.g. checkout) will check `emailVerified`.
- Password reset:
  - `request` always answers 202, does nothing for unknown or suspended accounts, and sends in the background
    (the response time does not reveal whether the account exists);
  - `confirm` sets the new password, revokes every session (`PASSWORD_CHANGED`), invalidates other reset links
    and marks the email verified (the link proves mailbox control).
- Mail transport (`MAIL_TRANSPORT`):
  - `smtp` (nodemailer; `SMTP_URL`): required in production;
  - `log` (prints emails, development only; refused in production because it would log reset links);
  - `memory` (tests only).
  Locally, `infra/compose.yaml` runs Mailpit (SMTP 127.0.0.1:1025, inbox http://localhost:8025).
- Rate limits: reset requests 20 per IP and 5 per account per hour; verification re-sends 5 per user per hour.
- Security events: `EMAIL_VERIFICATION_SENT`, `EMAIL_VERIFIED`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`.

## ADR-012: Marketplace core (Milestones 5–18)

- **Platform Owner:** `pnpm bootstrap:platform-owner` reads `PLATFORM_OWNER_EMAIL/PASSWORD/NAME`. It is idempotent: it creates the account
  or promotes an existing one, and never changes the password unless `PLATFORM_OWNER_RESET_PASSWORD=true`.
  Only a PLATFORM_OWNER can grant or remove platform roles. Admin actions go to the append-only `audit_log`.
- **Service zones:** PostGIS `MultiPolygon` per zone, with an active flag and delivery fee. Bergamo is seeded as `IT-BG-BERGAMO`
  (approximate envelope, replaceable through `PATCH /admin/zones/:id` with GeoJSON). Points are matched with `ST_Covers`.
- **Partners:**
  - one `partner_accounts` table, with kind `SHOP | FREELANCE_SELLER | COURIER`. A freelance seller needs no shop;
    shops and freelancers share the commerce tables as "sellers" without being the same entity;
  - verification goes `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED`, with `SUSPENDED` after approval.
    Approval grants the matching capability. Onboarding endpoints only need sign-in, so unapproved partners are never locked out;
  - selling or delivering requires `APPROVED`, re-checked on every request.
- **Orders:** the state machine is in `@flower-man/domain`. Every change goes through `transitionOrder`, which appends to
  `order_status_history`. Unpaid orders are invisible to sellers. Checkout recomputes all amounts from database prices,
  requires a verified email, and enforces one seller per cart, the zone and stock.
- **Payments:** a provider abstraction:
  - `simulated` for development and tests; refused in production;
  - `stripe`: a PaymentIntent with idempotency key `order-<id>`. Success comes **only** from the signature-verified webhook
    (raw body, `STRIPE_WEBHOOK_SECRET`), and events are de-duplicated in `payment_events`;
  - refunds are idempotent too. A payment that arrives after the order expired is refunded automatically.
- **Delivery:** a job is OFFERED when the seller marks the order ready. The first courier to accept wins (conditional UPDATE).
  Pickup, transit, arrival, proof and completion are courier-only and checked by the state machine. GPS is accepted only while
  ASSIGNED, PICKED_UP or IN_TRANSIT, for the assigned courier. ETA = distance / 18 km/h. The GPS trail is purged 30 days after delivery.
- **Proof:** a raw JPEG/PNG/WebP upload (≤ 8 MB, checked by magic bytes), stored through `ObjectStorage` with SHA-256 and optional GPS metadata.
  Completion requires proof; a database constraint enforces it too. Drivers: `local` (development) and `s3` (production,
  see ADR-015).
- **Earnings:** an append-only `ledger_entries` table, signed cents:
  - on delivery, the seller gets ORDER_REVENUE (+subtotal) and PLATFORM_COMMISSION (−commission), and the courier gets DELIVERY_FEE;
  - a partial unique index makes earnings impossible to record twice;
  - refunds after delivery add a REFUND_ADJUSTMENT (capped at what the seller earned on the order);
  - a trigger allows only `settlement_id` to change: attach while unsettled, detach only from a FAILED settlement.
- **Settlements:** `CREATED → PROCESSING → PAID` (bank or provider reference required), or `FAILED`, which makes the entries payable again.
  Creation locks the partner's unsettled entries, so concurrent requests cannot settle the same entry twice. Payouts are recorded
  manually today; Stripe Connect or SEPA can later drive the same transitions.
- **Notifications:** every event is stored in the in-app inbox (`/me/notifications`). Expo push is best effort and needs `PUSH_ENABLED=true`;
  tokens reported as `DeviceNotRegistered` are deleted.
- **Privacy:** `POST /me/deletion-request`. An admin completes it, which anonymises the user and removes credentials, devices and cart
  while keeping bookkeeping records. Couriers' locations are stored only during active deliveries.
- **Maintenance** (every minute, idempotent): expire unpaid orders and release their stock, expire custom requests, purge old GPS points.

## ADR-013: Admin web app (Milestone 21)

- Next.js 16 (App Router) in `apps/admin-web` on port 3000. Run it with `pnpm dev:admin`, build it with `pnpm build:admin` (`output: 'standalone'`).
- **Backend-for-frontend:** the browser never holds API tokens.
  - `POST /api/session` signs in through the API and refuses non-admin accounts. The access and refresh tokens are stored
    in `httpOnly`, `SameSite=Strict` cookies (`Secure` in production).
  - `/api/proxy/*` forwards only `admin/*` and `auth/me` to the API with the bearer token, and refreshes the session transparently.
  - Every state-changing request needs the `x-flowerman-admin: 1` header. Browsers cannot send it cross-site without a CORS preflight,
    and the admin app never grants one.
- Server-only setting: `ADMIN_API_URL` (default `http://127.0.0.1:4000`).
- Security headers: CSP, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and no `X-Powered-By`.
- All business rules live in the API. The admin UI only calls protected endpoints.

## ADR-014: Mobile apps (Milestones 19, 20, 23)

- Two separate Expo SDK 57 apps (React Native 0.86.3, React 19.2.3). Versions come from the SDK's own bundled
  version map (`expo install`, offline mode when the network is restricted). Each app has its own configuration:
  - customer app: `it.flowerman.customer`, scheme `flowerman`;
  - partner app: `it.flowerman.partner`, scheme `flowermanpartner`.
  Each needs its own EAS project, created with `eas init` and never invented; the ID is set in `EXPO_PUBLIC_EAS_PROJECT_ID`.
- Both apps use `@flower-man/api-client`. Tokens are stored with `expo-secure-store` (keychain/keystore), and refreshes are serialised
  because refresh tokens are single use.
- Navigation is a small in-app stack with tabs, which avoids extra native dependencies. Deep links `…/verify-email?token=` and
  `…/reset-password?token=` open the matching screens.
- Customer app:
  - location is foreground only, and `ACCESS_BACKGROUND_LOCATION` is explicitly blocked;
  - payment uses the Stripe Payment Sheet (`@stripe/stripe-react-native`) with the PaymentIntent client secret.
    The order becomes PAID only through the server webhook. The simulated "test payment" button exists only in `__DEV__` builds.
- Partner app (one app for all partner kinds; features depend on approved accounts):
  - background location uses `expo-location` + `expo-task-manager` and starts only for an accepted delivery,
    with a visible foreground-service notification on Android;
  - it stops on completion, release or sign-out, and when the API answers 409 (delivery no longer active);
  - proof photos are taken with `expo-image-picker` (camera only) and uploaded as raw bytes.
- Push: `expo-notifications` registers the Expo token when the app runs on a device with a project ID. Expo Go cannot test remote push.
- Verified so far: both apps typecheck and bundle for Android (`expo export`, Hermes). Device testing needs the steps in docs/runbook.md.
- Known peer warning: `@expo/router-server` (web only) pulls `react-dom@19.2.9` as an auto-installed peer. It does not affect native builds.

## ADR-015: Production storage and shared rate limits

- **Object storage:** `STORAGE_DRIVER=s3` works with any S3-compatible service (AWS S3, Cloudflare R2, MinIO, Scaleway…).
  - Requests are signed with AWS Signature V4, implemented on `node:crypto` (`apps/api/src/storage/s3-signer.ts`). The API has no
    AWS SDK dependency: it only needs PUT and GET of single objects. The signer is tested against the worked example in the AWS
    documentation, and the driver against an in-process S3 stand-in that verifies every signature.
  - Settings: `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and optional `S3_ENDPOINT`. With an endpoint,
    objects are addressed path-style (`<endpoint>/<bucket>/<key>`); without one, AWS virtual-hosted style.
  - The bucket stays **private**. Proof photos are only served through the API, which checks who may see them.
    Use a key that can only `PutObject`/`GetObject` on that bucket.
  - `STORAGE_DRIVER=local` is refused when `NODE_ENV=production`. `S3_ENDPOINT` must be https in production.
  - Errors carry only the HTTP status; response bodies and credentials are never logged.
- **Rate limits:** `RATE_LIMIT_STORE=postgres` keeps the fixed-window counters in `rate_limit_windows` (migration 0013), so every
  API instance shares them. It is the default in production; `memory` remains the default elsewhere.
  - One atomic `INSERT … ON CONFLICT DO UPDATE` per attempt, no extra infrastructure (no Redis).
  - Keys are `<rule>:<sha256(key)>`: the table never holds an email address or an IP address in clear.
  - The table is `UNLOGGED`: a database crash only resets the windows early. The maintenance job purges expired rows.

## ADR-016: Continuous integration and container images

- `.github/workflows/ci.yml` runs on every push to `main` and every pull request:
  - `pnpm release:check` (repository rules, typecheck, unit tests);
  - the PostgreSQL/PostGIS container from `infra/compose.yaml`, `pnpm db:migrate`, `pnpm test:integration`;
  - the production builds of the API and the admin app, and both Docker images.
- Actions are pinned to full commit SHAs, with the release tag in a comment. Releases younger than two weeks are not used.
  The workflow token is read-only (`permissions: contents: read`).
- Images (`apps/api/Dockerfile`, `apps/admin-web/Dockerfile`) build from the repository root on `node:24.7.0-alpine`:
  - API: production dependencies only, plus the migrations at `/app/migrations`; the same image runs the server,
    the migrations and the owner bootstrap.
  - Admin: the Next.js standalone server.
  - Both run as the non-root `node` user and take configuration only from environment variables. `.dockerignore` keeps
    `.env` files, local storage and build output out of the build context.

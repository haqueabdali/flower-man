# Flower Man

Flower marketplace and delivery platform, launching first in **Bergamo (BG), Italy**.
It connects customers, flower shops, freelance flower sellers, couriers and platform administrators.

> Status: **Milestone 4a: API Foundation**. See [docs/milestones.md](docs/milestones.md).

## Repository layout

```text
apps/
  api/               REST API (NestJS 12) + database migration CLI
  admin-web/         Admin web app (Next.js). Placeholder for now
  customer-mobile/   Customer app (Expo). Placeholder for now
  partner-mobile/    Partner app for shops, freelance sellers and couriers (Expo). Placeholder for now
packages/
  contracts/         API contracts shared by every app
  domain/            Framework-independent domain types and rules
  security/          Shared security primitives (no secrets)
infra/               Local infrastructure (compose.yaml: PostgreSQL 17 + PostGIS)
  database/migrations/ Numbered SQL migrations (applied by pnpm db:migrate)
scripts/             Repository tooling scripts
docs/                Architecture decisions and milestone status
```

## Requirements

| Tool    | Version                                                   |
|---------|-----------------------------------------------------------|
| Node.js | 24 LTS (`>=24.3.0`) or 22 (`>=22.13.0`)                   |
| pnpm    | 11.19.0 (pinned in `package.json` → `packageManager`)     |
| Git     | 2.40+                                                     |
| Docker  | Docker Desktop with Compose v2+ (from Milestone 2)        |

Use **pnpm only**. Do not run `npm install` inside the workspace.

## Getting started (Windows, Git Bash)

```bash
# First time only (the folder must be empty or not exist):
git clone -b claude/awesome-hopper-td9ytw https://github.com/haqueabdali/flower-man.git /e/flower-man

cd /e/flower-man
cp .env.example .env
pnpm install
pnpm typecheck

# Docker Desktop must be running
pnpm db:up
pnpm db:check
pnpm db:migrate

pnpm test               # unit tests (no database needed)
pnpm test:integration   # integration tests (needs pnpm db:up)

pnpm dev:api            # API on http://127.0.0.1:4000/api/v1 (reloads on change)
curl http://127.0.0.1:4000/api/v1/health
```

If you already have a `.env` from an earlier milestone, copy the new API lines from `.env.example` into it.

## Root scripts

| Script            | What it does                                                        |
|-------------------|---------------------------------------------------------------------|
| `pnpm build:core` | Builds `packages/*` (contracts, domain, security) into `dist/`      |
| `pnpm typecheck`  | Runs `build:core`, then typechecks every package and app            |
| `pnpm dev:api`    | Builds and runs the API with automatic reload (`tsc --watch` + `node --watch`) |
| `pnpm test`       | Unit tests (Node's built-in test runner). No database needed        |
| `pnpm test:integration` | Integration tests against PostgreSQL in throwaway databases (needs `pnpm db:up`) |
| `pnpm db:up`      | Starts PostgreSQL/PostGIS (`infra/compose.yaml`) and waits until healthy |
| `pnpm db:check`   | Prints database, user, PostgreSQL version, PostGIS available/installed, timezone, locale |
| `pnpm db:status`  | Shows the database container state (including stopped)             |
| `pnpm db:logs`    | Shows the last 100 database log lines                               |
| `pnpm db:down`    | Stops the database. **Data is kept** in the `flower-man_db-data` volume |
| `pnpm db:migrate` | Applies pending SQL migrations from `infra/database/migrations/`    |
| `pnpm db:migrate:status` | Lists applied and pending migrations                         |

Local database: `postgresql://flower_man:flower_man@127.0.0.1:55432/flower_man` (see `.env.example`).
It is bound to `127.0.0.1` only. Migration rules: [infra/database/migrations/README.md](infra/database/migrations/README.md). Never run `docker compose down -v` unless you intend to delete all local data.

More scripts are added only when the underlying command exists.

## Troubleshooting

### `pnpm db:up` reports `Ports are not available` for 55432 (Windows)

Hyper-V/WinNAT may have reserved a port range containing 55432. Check:

```bash
netsh interface ipv4 show excludedportrange protocol=tcp
```

If a listed range contains 55432, reserve the port for Flower Man:
1. Quit Docker Desktop, then run `wsl --shutdown`.
2. In an **Administrator** terminal, run:
   ```bat
   net stop winnat
   netsh int ipv4 add excludedportrange protocol=tcp startport=55432 numberofports=1
   net start winnat
   ```
3. Start Docker Desktop and run `pnpm db:up` again. 55432 now shows with `*` (administered) in the list above.

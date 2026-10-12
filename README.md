# Flower Man

Flower marketplace and delivery platform, launching first in **Bergamo (BG), Italy**.
It connects customers, flower shops, freelance flower sellers, couriers and platform administrators.

> Status: **Milestone 2: PostgreSQL/PostGIS**. See [docs/milestones.md](docs/milestones.md).

## Repository layout

```text
apps/
  api/               REST API (NestJS). Placeholder for now
  admin-web/         Admin web app (Next.js). Placeholder for now
  customer-mobile/   Customer app (Expo). Placeholder for now
  partner-mobile/    Partner app for shops, freelance sellers and couriers (Expo). Placeholder for now
packages/
  contracts/         API contracts shared by every app
  domain/            Framework-independent domain types and rules
  security/          Shared security primitives (no secrets)
infra/               Local infrastructure (compose.yaml: PostgreSQL 17 + PostGIS)
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
```

## Root scripts

| Script            | What it does                                                        |
|-------------------|---------------------------------------------------------------------|
| `pnpm build:core` | Builds `packages/*` (contracts, domain, security) into `dist/`      |
| `pnpm typecheck`  | Runs `build:core`, then typechecks every package and app            |
| `pnpm db:up`      | Starts PostgreSQL/PostGIS (`infra/compose.yaml`) and waits until healthy |
| `pnpm db:check`   | Prints database, user, PostgreSQL version, PostGIS available/installed, timezone, locale |
| `pnpm db:status`  | Shows the database container state (including stopped)             |
| `pnpm db:logs`    | Shows the last 100 database log lines                               |
| `pnpm db:down`    | Stops the database. **Data is kept** in the `flower-man_db-data` volume |

Local database: `postgresql://flower_man:flower_man@127.0.0.1:55432/flower_man` (see `.env.example`).
It is bound to `127.0.0.1` only. Never run `docker compose down -v` unless you intend to delete all local data.

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

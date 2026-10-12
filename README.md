# Flower Man

Flower marketplace and delivery platform, launching first in **Bergamo (BG), Italy**.
It connects customers, flower shops, freelance flower sellers, couriers and platform administrators.

> Status: **Milestone 1: Monorepo Foundation**. See [docs/milestones.md](docs/milestones.md).

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
pnpm install
pnpm typecheck
```

## Root scripts

| Script            | What it does                                                        |
|-------------------|---------------------------------------------------------------------|
| `pnpm build:core` | Builds `packages/*` (contracts, domain, security) into `dist/`      |
| `pnpm typecheck`  | Runs `build:core`, then typechecks every package and app            |

More scripts are added only when the underlying command exists.

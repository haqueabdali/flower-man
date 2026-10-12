# Architecture Decision Log

Short records of decisions that later milestones must respect.
Never rewrite an accepted decision: add a new one that supersedes it.

## ADR-001: pnpm 11 workspace monorepo (Milestone 1)

- pnpm `11.19.0` is pinned via `packageManager`. Do not upgrade to pnpm 12 (Rust port) without a dedicated decision.
- Workspace settings live in `pnpm-workspace.yaml`. In pnpm 11, `.npmrc` is only for auth and registry settings.
- Shared versions use the pnpm **catalog** (`"typescript": "catalog:"`).
- Internal dependencies use `"workspace:*"`.
- Supply-chain defaults are kept explicit: `minimumReleaseAge: 1440` (24h) and `strictDepBuilds: true`.
  A dependency's install script is only allowed after review, by adding it to `allowBuilds`.

## ADR-002: TypeScript 6.0.x, strict (Milestone 1)

- `typescript ~6.0.3`. Expo SDK 57 and Nest CLI 12 templates both ship TypeScript ~6.0.
  TypeScript 7 (the native port) is deferred until the whole toolchain supports it.
- `tsconfig.base.json` holds strictness flags only. Each project chooses its module system:
  - packages and API: `NodeNext`
  - Next.js and Expo: `Bundler`
- TypeScript 6 defaults `types` to `[]`. Projects opt in explicitly (for example, the API uses `"types": ["node"]`).
- No `any`, no `@ts-ignore` without a documented reason.

## ADR-003: ESM-only shared packages, built to `dist/` (Milestone 1)

- NestJS 12 is ESM-only (`"type": "module"`), so the API and every shared package are ESM.
- Shared packages compile with `tsc` to `dist/` and expose it through `exports` (`types` + `default`).
  Node (API), Metro (Expo) and Next.js all consume the same built JavaScript.
- Consumers therefore need `pnpm build:core` before they typecheck or run. `pnpm typecheck` does this automatically.
- Relative imports inside packages use explicit `.js` extensions (NodeNext rule).
- `packages/contracts` and `packages/domain` must not import Node-only, NestJS or React modules.

## ADR-004: Windows-compatible tooling (Milestone 1)

- The primary development machine is Windows with Git Bash. pnpm runs package scripts with `cmd.exe` on Windows, so:
  - package scripts use only `&&` chaining and double quotes;
  - there is no `rm -rf`: file operations go through Node scripts in `scripts/` (for example `scripts/clean.mjs`).
- `.gitattributes` forces LF line endings (`* text=auto eol=lf`), overriding Git for Windows' `core.autocrlf=true`.

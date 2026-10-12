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

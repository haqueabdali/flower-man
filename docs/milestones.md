# Milestone Status

Legend: ✅ verified on the developer machine · 🟡 implemented, not yet verified · ⏳ planned

| #  | Milestone                     | Status | Notes |
|----|-------------------------------|--------|-------|
| 0  | Environment                   | ✅     | Node 24.7.0, pnpm 11.19.0, Git 2.50.1, Docker 29.7.2 + Compose v5.4.0, WSL 2. Docker Desktop must be running. |
| 1  | Monorepo Foundation           | ✅     | Workspace, strict TS, placeholder apps/packages. `pnpm typecheck` exit 0 on Windows. |
| 2  | PostgreSQL/PostGIS            | ✅     | PostgreSQL 17.11 + PostGIS 3.6.4 on `127.0.0.1:55432`, healthy, `db:check` OK and port reachable on Windows. |
| 3  | Migration System              | ✅     | SQL runner (`pnpm db:migrate`), `schema_migrations`, 0001 creates PostGIS. 9/9 integration tests pass on Windows. |
| 4a | API Foundation                | ✅     | NestJS 12 app, config validation, pg pool, `/api/v1/health`, helmet, CORS allowlist, error shape, request IDs, `pnpm dev:api`. Verified on Windows. |
| 4b | Identity & Authentication     | ✅     | Merged; covered by the integration suite. |
| 4c | Email Verification & Password Recovery | ✅ | Verified on Windows (user report). |
| 5  | Platform Owner                | ✅     | API covered by the end-to-end suite: green in GitHub CI and on Windows (58/58 run). See ADR-012. |
| 6  | Service Zones                 | ✅     | API covered by the end-to-end suite: green in GitHub CI and on Windows (58/58 run). See ADR-012. |
| 7  | Partner Onboarding            | ✅     | API covered by the end-to-end suite: green in GitHub CI and on Windows (58/58 run). See ADR-012. |
| 8  | Marketplace                   | ✅     | API covered by the end-to-end suite: green in GitHub CI and on Windows (58/58 run). Product photos: ADR-017. See ADR-012. |
| 9  | Custom Requests               | ✅     | API covered by the end-to-end suite: green in GitHub CI and on Windows (58/58 run). See ADR-012. |
| 10 | Cart & Checkout               | ✅     | API covered by the end-to-end suite: green in GitHub CI and on Windows (58/58 run). See ADR-012. |
| 11 | Orders                        | ✅     | API covered by the end-to-end suite: green in GitHub CI and on Windows (58/58 run). See ADR-012. |
| 12 | Payments                      | ✅     | API covered by the end-to-end suite: green in GitHub CI and on Windows (58/58 run). See ADR-012. |
| 13 | Courier Dispatch              | ✅     | API covered by the end-to-end suite: green in GitHub CI and on Windows (58/58 run). See ADR-012. |
| 14 | Location Tracking             | ✅     | API covered by the end-to-end suite: green in GitHub CI and on Windows (58/58 run). See ADR-012. |
| 15 | Delivery Proof                | ✅     | API covered by the end-to-end suite: green in GitHub CI and on Windows (58/58 run). Customers see the proof photo once delivered. See ADR-012. |
| 16 | Notifications                 | ✅     | API covered by the end-to-end suite: green in GitHub CI and on Windows (58/58 run). See ADR-012. |
| 17 | Earnings                      | ✅     | API covered by the end-to-end suite: green in GitHub CI and on Windows (58/58 run). See ADR-012. |
| 18 | Payout Settlements            | ✅     | API covered by the end-to-end suite: green in GitHub CI and on Windows (58/58 run). See ADR-012. |
| 19 | Customer Mobile Completion    | 🟡     | Expo app: auth + email links, shop by location, cart, checkout, Stripe Payment Sheet / dev test payment, orders with live tracking, custom requests & offers, inbox, account deletion. Typechecks and bundles (Android, Hermes); not yet run on a device. |
| 20 | Partner Mobile Completion     | 🟡     | Expo app: onboarding/verification, seller orders, products, custom request offers, courier jobs, background GPS (active delivery only), camera proof, earnings. Typechecks and bundles; not yet run on a device. |
| 21 | Admin Completion              | 🟡     | Next.js 16 admin (BFF with httpOnly cookies): dashboard, partners, users, orders/refunds, deliveries/proof, custom requests, payments, payouts, zones, security/audit, privacy. Builds and runs on Linux. |
| 22 | Security Hardening            | 🟡     | Built into each milestone (ADRs 4-15): S3-compatible storage driver and PostgreSQL-shared rate limits included. |
| 23 | EAS/Native Configuration      | 🟡     | EAS projects created (`@flower-man/flower-man-customer`, `@flower-man/flower-man-partner`) and linked in app.config.ts. Next: Android development builds, push credentials. |
| 24 | Production Configuration      | 🟡     | `.env.production.example`, `pnpm release:production-check` (fails until real values exist), Docker images for API and admin (ADR-016). |
| 25 | End-to-End Testing            | 🟡     | API end-to-end suite covers both spec scenarios (CI + Windows). `pnpm db:seed:demo` + `pnpm dev:phone` + docs/device-test.md for device tests (pending). |
| 26 | Release                       | ⏳     | `pnpm release:check`, GitHub Actions CI and runbook ready. Builds need EAS projects, Stripe live keys, hosting. |

# Flower Man runbook

Local setup, mobile builds, deployment, migrations and rollback. Phone install and test script: [device-test.md](device-test.md).

## 1. Local development (Windows, Git Bash)

```bash
cd /e/flower-man
pnpm install
cp .env.example .env            # first time only; afterwards copy new lines from .env.example
pnpm db:up                      # PostgreSQL/PostGIS + Mailpit (http://localhost:8025)
pnpm db:migrate
pnpm bootstrap:platform-owner   # uses PLATFORM_OWNER_* from .env
pnpm dev:api                    # http://127.0.0.1:4000/api/v1
pnpm dev:admin                  # http://localhost:3000 (sign in as the platform owner)
```

Demo data (local only, safe to repeat): `pnpm db:seed:demo` creates an approved shop with 5 products, a freelance seller
with 2, an online courier and a customer in Bergamo. Every demo account uses the password `flowerman-demo-2026`:
`demo.shop@`, `demo.freelancer@`, `demo.courier@`, `demo.customer@flowerman.localhost`. It refuses `NODE_ENV=production`.

Phone testing (development builds installed, phone on the same Wi-Fi):

```bash
pnpm dev:phone                     # API on your Wi-Fi + admin + both app servers, in one window
LAN_IP=192.168.1.23 pnpm dev:phone # if it picks the wrong address (check with ipconfig)
```

It prints the URLs to enter in each app (customer `:8081`, partner `:8082`) and checks that the API is reachable on the
network. Ctrl+C stops everything. `.env` is not changed: only this run listens on `0.0.0.0`.

Expo Go (`pnpm dev:customer` / `pnpm dev:partner`) has no background location and no remote push; prefer development builds.

Test payments in development: `PAYMENT_PROVIDER=simulated`. The payment screen shows a test button, but only in development builds.

## 2. EAS (Expo Application Services)

Both apps belong to the Expo account `flower-man`. Each is a **separate EAS project**, and its ID is in its `app.config.ts`
(created with `npx eas-cli init`, never invented; `EXPO_PUBLIC_EAS_PROJECT_ID` can override it, e.g. for staging):

| App | EAS project | Package / bundle ID |
|---|---|---|
| customer | `@flower-man/flower-man-customer` | `it.flowerman.customer` |
| partner | `@flower-man/flower-man-partner` | `it.flowerman.partner` |

`eas init` reports "Cannot automatically write to dynamic config": that is expected, because the config is code.

Android development build (once per app, and again after native dependency changes):

```bash
cd /e/flower-man/apps/customer-mobile
npx eas-cli project:info                                   # must show @flower-man/flower-man-customer
npx eas-cli build --profile development --platform android # accept "Generate a new Android Keystore?"
```

Same steps in `apps/partner-mobile`. Install each APK on the phone from the link or QR code EAS prints, then run
`pnpm dev:phone` (section 1).

Push credentials:
- Android: upload the FCM v1 service-account key with `npx eas-cli credentials`.
- iOS: let EAS create the APNs key.

Then set `PUSH_ENABLED=true` on the API.

The `eas-build-post-install` script builds the shared packages (`pnpm build:core`) on the EAS build machine.

## 3. Production deployment

1. Fill the variables of `.env.production.example` in the hosting platform's secret store.
2. Validate them before every release:
   ```bash
   pnpm build:api
   node --env-file=.env.production scripts/production-check.mjs
   ```
   This must print "Production environment OK".
3. Build the container images (from the repository root; both run as the non-root `node` user):
   ```bash
   docker build -f apps/api/Dockerfile -t flower-man-api .
   docker build -f apps/admin-web/Dockerfile -t flower-man-admin .
   ```
   - API: `docker run --env-file .env.production -p 4000:4000 flower-man-api` (health: `GET /api/v1/health`).
   - Admin: `docker run -e ADMIN_API_URL=https://api.example.it -p 3000:3000 flower-man-admin`.
   - Without Docker: `pnpm build:api` then `node apps/api/dist/main.js`; `pnpm build:admin` then
     `node apps/admin-web/.next/standalone/apps/admin-web/server.js` (copy `.next/static` next to it).
4. Migrate before starting the new API version:
   `docker run --rm --env-file .env.production flower-man-api node dist/database/migrate.js up --dir /app/migrations`.
   It is safe to run from several instances at once, because an advisory lock serialises the runs.
5. Run the bootstrap once (idempotent):
   `docker run --rm --env-file .env.production flower-man-api node dist/cli/bootstrap-platform-owner.js`.
6. Object storage: create a **private** bucket and an access key limited to `PutObject`/`GetObject` on it.
   Put the values in `S3_*` (see `.env.production.example`).
7. In the Stripe dashboard, add a webhook to `https://<api>/api/v1/payments/stripe/webhook` for
   `payment_intent.succeeded` and `payment_intent.payment_failed`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
8. Mobile: `npx eas-cli build --profile production --platform android` (and `ios`), then `npx eas-cli submit`.

## 4. Migrations: rules and rollback

- Migrations are forward-only. **Never edit an applied migration.** Fix mistakes with a new migration.
- Write every migration so the **previous** API version still works against the new schema
  (add columns and tables; remove things only in a later release). This makes rolling back the API safe.
- Before each release, take a database backup or snapshot: `pg_dump --format=custom`, or the managed provider's snapshot.

Rollback:
1. **API or admin bug:** redeploy the previous build. The schema is backward compatible, so the database stays as it is.
2. **Bad data migration:** stop the API, restore the snapshot taken before the release, then redeploy the previous build.
3. **Mobile:** ship a fix through a new EAS build. OTA updates through `expo-updates` are configured once a project ID exists.
   Do not roll back the API in a way that breaks app versions already released.

## 5. Operations

- Health: `GET /api/v1/health` returns 200 `{status:"ok"}`, or 503 when the database is unreachable.
  Use it for load-balancer checks.
- Logs carry `X-Request-Id`. Error responses show the same `requestId` to users, so support can find the log line.
- Maintenance runs every minute inside the API:
  - unpaid orders are cancelled after `UNPAID_ORDER_TTL_MINUTES`;
  - custom requests expire;
  - GPS points are purged 30 days after delivery.
- Payouts: Admin → Earnings & payouts → create a settlement → mark it processing → make the bank transfer
  → mark it paid with the transfer reference.

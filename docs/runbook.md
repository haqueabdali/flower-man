# Flower Man runbook

Local setup, mobile builds, deployment, migrations and rollback.

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

Mobile apps on a phone (same Wi-Fi):
1. In `.env`, set `HOST=0.0.0.0` and restart `pnpm dev:api`.
2. Find the PC's LAN address with `ipconfig`, for example 192.168.1.10.
3. Start the apps, pointing them at the API:
   ```bash
   EXPO_PUBLIC_API_URL=http://192.168.1.10:4000 pnpm dev:customer
   EXPO_PUBLIC_API_URL=http://192.168.1.10:4000 pnpm dev:partner
   ```
4. Scan the QR code with Expo Go.

Expo Go has no background location and no remote push. Use a development build (section 2) to test those.

Test payments in development: `PAYMENT_PROVIDER=simulated`. The payment screen shows a test button, but only in development builds.

## 2. EAS (Expo Application Services)

Do this once per app. **Never invent project IDs.**

```bash
cd /e/flower-man/apps/customer-mobile
npx eas-cli login
npx eas-cli init                  # creates the EAS project and prints its ID
npx eas-cli project:info          # verify
# put the ID in EXPO_PUBLIC_EAS_PROJECT_ID for this app's builds (EAS environment variables or eas.json env)
npx eas-cli build --profile development --platform android
```

Repeat in `apps/partner-mobile`. It is a **separate project** with its own ID:
- customer app: `it.flowerman.customer`
- partner app: `it.flowerman.partner`

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
3. Build:
   - API: `pnpm build:api`, then run `node apps/api/dist/main.js`. The process needs `infra/database/migrations`.
   - Admin: `pnpm build:admin`, then run `node apps/admin-web/.next/standalone/apps/admin-web/server.js`.
4. Migrate before starting the new API version:
   `node apps/api/dist/database/migrate.js up --dir infra/database/migrations`.
   It is safe to run from several instances at once, because an advisory lock serialises the runs.
5. Run the bootstrap once: `node apps/api/dist/cli/bootstrap-platform-owner.js`. It is idempotent.
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

# Install and test on an Android phone

Everything in Git Bash on Windows. Phone and PC on the same Wi-Fi (no guest network, no VPN).

## 1. PC (once)

```bash
cd /e/flower-man
git checkout main && git pull origin main
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:seed:demo        # owner account + demo shop, freelancer, courier, customer in Bergamo
```

## 2. Build the two apps in the Expo cloud (once, ~10–25 min each)

```bash
cd /e/flower-man/apps/customer-mobile
npx eas-cli whoami                                   # if not signed in: npx eas-cli login
npx eas-cli build --profile development --platform android
cd /e/flower-man/apps/partner-mobile
npx eas-cli build --profile development --platform android
```

Answer **Yes** to "Generate a new Android Keystore?". Any other question: stop and ask before answering.
On the phone, open each build link (or scan its QR code) and install. If Android blocks it:
Settings → Apps → Chrome → Install unknown apps → Allow.

## 3. Every test session

```bash
cd /e/flower-man
pnpm db:up
pnpm dev:phone
```

The first time, Windows Firewall asks about Node.js: tick **Private networks** → **Allow**.
`dev:phone` prints a box with the exact URLs. In each app on the phone, tap "Enter URL manually":

| App | URL |
|---|---|
| Flower Man | `http://<your IP>:8081` |
| Flower Man Partner | `http://<your IP>:8082` |

If the box says the API is not reachable, or shows a wrong address (it must match "IPv4 Address" of the
Wi-Fi adapter in `ipconfig`): `LAN_IP=192.168.1.23 pnpm dev:phone` with your address.

## 4. Test accounts (password `flowerman-demo-2026`)

| Who | Email | App |
|---|---|---|
| Customer | `demo.customer@flowerman.localhost` | Flower Man |
| Shop | `demo.shop@flowerman.localhost` | Partner |
| Freelance seller | `demo.freelancer@flowerman.localhost` | Partner |
| Courier | `demo.courier@flowerman.localhost` | Partner |
| Admin | `owner@flowerman.localhost` / `change-this-local-owner-password` | http://localhost:3000 |

One phone is enough: sign out and in again in the Partner app to switch between shop and courier.

## 5. Test script

1. **Customer:** sign in, allow location (or use the Bergamo default), open *Fiori di Città Alta*, add roses, check out,
   tap **Pay (development test payment)**.
2. **Partner as shop:** the order appears → accept → mark ready.
3. **Partner as courier:** accept the delivery, allow location **all the time** → picked up → on the way.
4. **Customer:** order screen shows the courier, ETA and **See courier on the map**.
5. **Courier:** arrived → take the proof photo → complete.
6. **Customer:** order delivered. **Admin:** order history, earnings, payouts.
7. **Custom request:** customer creates a request with a budget → shop sends an offer → customer accepts → pays.

Report back: what worked, and for anything that failed, the screen and the message (a photo is fine),
plus the last lines of the `dev:phone` window.

## Known limits of development builds

- Push notifications need the Firebase (FCM) key: `npx eas-cli credentials`, then `PUSH_ENABLED=true`.
- Card payments need Stripe test keys (`PAYMENT_PROVIDER=stripe` and the `STRIPE_*` keys); until then use **Pay (development test payment)**.

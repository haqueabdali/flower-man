// End-to-end business scenarios (spec sections 46 and 47) against the real HTTP API and a throwaway database.
import 'reflect-metadata';

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { after, before, describe, it } from 'node:test';

import type {
  AuthTokensResponse,
  CheckoutResponse,
  CourierJob,
  CustomRequestView,
  OrderDetail,
  PartnerAccount,
  PartnerBalance,
  Product,
  SettlementView,
} from '@flower-man/contracts';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import Stripe from 'stripe';

import { API_PREFIX, createApp } from '../app.factory.js';
import { type AppConfig, loadAppConfig } from '../config/app-config.js';
import { MAILER, MemoryMailer } from '../mail/mailer.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';
import { createTestDatabase, type TestDatabase } from '../testing/test-database.js';

const PASSWORD = 'correct horse battery staple';
// Bergamo: city centre (customer), Città Alta (shop), Borgo Palazzo (freelancer). Milan is outside the pilot zone.
const BERGAMO_CENTRE = { latitude: 45.6949, longitude: 9.6699 };
const CITTA_ALTA = { latitude: 45.7037, longitude: 9.6623 };
const BORGO_PALAZZO = { latitude: 45.6937, longitude: 9.6889 };
const MILAN = { latitude: 45.4642, longitude: 9.19 };
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(256), Buffer.from([0xff, 0xd9])]);

let database: TestDatabase;
let config: AppConfig;
let app: NestExpressApplication;
let base: string;
let db: pg.Pool;
let storageDir: string;

const email = (label: string) => `${label}.${randomBytes(4).toString('hex')}@example.com`;

interface Client {
  token: string;
  userId: string;
  get<T>(path: string, expected?: number): Promise<T>;
  post<T>(path: string, body?: unknown, expected?: number): Promise<T>;
  put<T>(path: string, body: unknown, expected?: number): Promise<T>;
  raw(method: string, path: string, body?: string | Buffer, headers?: Record<string, string>): Promise<Response>;
}

function client(token: string, userId: string): Client {
  const raw = (method: string, path: string, body?: string | Buffer, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...headers }, ...(body === undefined ? {} : { body }) });
  const call = async <T>(method: string, path: string, body: unknown, expected: number): Promise<T> => {
    const response = await raw(method, path, body === undefined ? undefined : JSON.stringify(body), body === undefined ? {} : { 'Content-Type': 'application/json' });
    const text = await response.text();
    assert.equal(response.status, expected, `${method} ${path} → ${response.status}: ${text}`);
    return (text ? JSON.parse(text) : undefined) as T;
  };
  return {
    token,
    userId,
    get: (path, expected = 200) => call('GET', path, undefined, expected),
    post: (path, body = {}, expected = 200) => call('POST', path, body, expected),
    put: (path, body, expected = 200) => call('PUT', path, body, expected),
    raw,
  };
}

async function signUp(label: string, verify = true): Promise<Client> {
  const response = await fetch(`${base}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email(label), password: PASSWORD, fullName: `Test ${label}` }),
  });
  assert.equal(response.status, 201);
  const tokens = (await response.json()) as AuthTokensResponse;
  if (verify) {
    await db.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [tokens.user.id]);
  }
  return client(tokens.accessToken, tokens.user.id);
}

async function approvedPartner(admin: Client, kind: 'SHOP' | 'FREELANCE_SELLER' | 'COURIER', location: { latitude: number; longitude: number }): Promise<{ user: Client; partner: PartnerAccount }> {
  const user = await signUp(kind.toLowerCase());
  const partner = await user.post<PartnerAccount>('/partner/accounts', {
    kind,
    displayName: `${kind} ${randomBytes(2).toString('hex')}`,
    phone: '+393331112233',
    address: 'Via XX Settembre 1, 24122 Bergamo BG',
    location,
    ...(kind === 'SHOP' ? { legalName: 'Fiori Bergamo S.r.l.', vatNumber: 'IT12345678901' } : {}),
  }, 201);
  await user.post(`/partner/accounts/${partner.id}/submit`);
  await admin.post(`/admin/partners/${partner.id}/review`, { status: 'APPROVED', notes: 'Documents checked' }, 204);
  if (kind === 'COURIER') {
    await user.post('/partner/courier/availability', { available: true }, 204);
  }
  return { user, partner: await user.get<PartnerAccount>(`/partner/accounts/${partner.id}`) };
}

async function deliver(courier: Client, deliveryId: string): Promise<void> {
  await courier.post(`/courier/deliveries/${deliveryId}/accept`);
  await courier.post(`/courier/deliveries/${deliveryId}/pickup`);
  await courier.post(`/courier/deliveries/${deliveryId}/start`);
  await courier.post(`/courier/deliveries/${deliveryId}/locations`, { points: [{ ...BERGAMO_CENTRE, recordedAt: new Date().toISOString() }] });
  await courier.post(`/courier/deliveries/${deliveryId}/arrive`);
  const proof = await courier.raw('POST', `/courier/deliveries/${deliveryId}/proof`, JPEG, { 'Content-Type': 'image/jpeg' });
  assert.equal(proof.status, 201, await proof.text());
  await courier.post(`/courier/deliveries/${deliveryId}/complete`);
}

const pay = async (checkout: CheckoutResponse) => {
  const response = await fetch(`${base}/payments/simulated/${checkout.payment.reference}/succeed`, { method: 'POST' });
  assert.equal(response.status, 204);
};

let admin: Client;
let shop: { user: Client; partner: PartnerAccount };
let freelancer: { user: Client; partner: PartnerAccount };
let courier: { user: Client; partner: PartnerAccount };
let rose: Product;

before(async () => {
  const loaded = loadAppConfig({ ...process.env, NODE_ENV: 'test', MAIL_TRANSPORT: 'memory', PAYMENT_PROVIDER: 'simulated' });
  database = await createTestDatabase(loaded.database);
  storageDir = await mkdtemp(join(tmpdir(), 'flower-man-storage-'));
  config = {
    ...loaded,
    database: database.config,
    storage: { driver: 'local', localDir: storageDir, s3: null },
    auth: { ...loaded.auth, rateLimits: { ...loaded.auth.rateLimits, registerPerIp: { limit: 10_000, windowMs: 60_000 } } },
  };
  app = await createApp(config);
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/${API_PREFIX}`;
  db = new pg.Pool({ connectionString: database.config.connectionString, ssl: database.config.ssl });

  admin = await signUp('admin');
  await db.query(`INSERT INTO user_capabilities (user_id, capability) VALUES ($1, 'PLATFORM_OWNER'), ($1, 'PLATFORM_ADMIN')`, [admin.userId]);
  shop = await approvedPartner(admin, 'SHOP', CITTA_ALTA);
  freelancer = await approvedPartner(admin, 'FREELANCE_SELLER', BORGO_PALAZZO);
  courier = await approvedPartner(admin, 'COURIER', BERGAMO_CENTRE);
  rose = await shop.user.post<Product>('/seller/products', { name: 'Dozen red roses', category: 'ROSES', priceMinor: 2990, stock: 5 }, 201);
});

after(async () => {
  await db.end();
  await app.close();
  await database.drop();
  await rm(storageDir, { recursive: true, force: true });
});

describe('primary scenario: catalogue order → delivery → earnings → settlement', () => {
  it('runs end to end', async () => {
    // Customer registers and verifies the email through the real link.
    const mailbox = app.get<MemoryMailer>(MAILER);
    const signup = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email('customer'), password: PASSWORD, fullName: 'Giulia Rossi' }),
    });
    const tokens = (await signup.json()) as AuthTokensResponse;
    const customer = client(tokens.accessToken, tokens.user.id);
    // This customer's phone is in English; everyone else keeps the Italian default.
    await customer.put('/me/preferences', { language: 'de' }, 400);
    await customer.put('/me/preferences', { language: 'en' }, 204);
    let token: string | undefined;
    for (let i = 0; i < 50 && !token; i += 1) {
      token = /token=([A-Za-z0-9_-]+)/.exec(mailbox.sent.find((m) => m.to === tokens.user.email)?.text ?? '')?.[1];
      if (!token) await new Promise((r) => setTimeout(r, 20));
    }
    await customer.post('/auth/email-verification/confirm', { token }, 204);

    // Browses flowers available at the delivery address; Milan is not served.
    const catalogue = await customer.get<{ items: Product[] }>(`/catalog/products?lat=${BERGAMO_CENTRE.latitude}&lng=${BERGAMO_CENTRE.longitude}`);
    assert.ok(catalogue.items.some((p) => p.id === rose.id));
    await customer.get(`/catalog/products?lat=${MILAN.latitude}&lng=${MILAN.longitude}`, 400);

    // Cart + checkout. A stale client total is refused; the server computes the real one.
    await customer.put('/cart/items', { productId: rose.id, quantity: 2 });
    const delivery = {
      recipientName: 'Marco Bianchi',
      recipientPhone: '+393339998877',
      deliveryAddress: 'Piazza Vecchia 1, 24129 Bergamo BG',
      giftMessage: 'Buon compleanno!',
    };
    await customer.post('/checkout', { ...delivery, deliveryLocation: MILAN }, 400);
    await customer.post('/checkout', { ...delivery, deliveryLocation: BERGAMO_CENTRE, expectedTotalMinor: 100 }, 409);
    const checkout = await customer.post<CheckoutResponse>('/checkout', { ...delivery, deliveryLocation: BERGAMO_CENTRE, expectedTotalMinor: 2 * 2990 + 590 }, 201);
    assert.equal(checkout.order.status, 'PENDING_PAYMENT');
    assert.equal(checkout.order.totalMinor, 6570);
    assert.equal(checkout.payment.amountMinor, 6570);

    // The customer cannot mark the order paid; only the payment confirmation can.
    await shop.user.post(`/seller/orders/${checkout.order.id}/accept`, {}, 404);
    await pay(checkout);
    const orderId = checkout.order.id;
    assert.equal((await customer.get<OrderDetail>(`/orders/${orderId}`)).status, 'PAID');

    // Seller receives, accepts, prepares, marks ready.
    const sellerOrders = await shop.user.get<{ items: { id: string }[] }>('/seller/orders');
    assert.ok(sellerOrders.items.some((o) => o.id === orderId));
    await shop.user.post(`/seller/orders/${orderId}/ready`, {}, 409); // cannot skip steps
    await shop.user.post(`/seller/orders/${orderId}/accept`);
    await shop.user.post(`/seller/orders/${orderId}/prepare`);
    await shop.user.post(`/seller/orders/${orderId}/ready`);

    // Courier job is offered; courier accepts and works it.
    const offered = await courier.user.get<{ items: CourierJob[] }>('/courier/jobs/offered');
    const job = offered.items.find((j) => j.orderNumber === checkout.order.orderNumber);
    assert.ok(job);
    assert.equal(job.recipientPhone, null, 'contact details only after accepting');
    await courier.user.post(`/courier/deliveries/${job.deliveryId}/accept`);
    await courier.user.post(`/courier/deliveries/${job.deliveryId}/complete`, {}, 409);
    await courier.user.post(`/courier/deliveries/${job.deliveryId}/pickup`);
    await courier.user.post(`/courier/deliveries/${job.deliveryId}/start`);
    const eta = await courier.user.post<{ etaAt: string | null }>(`/courier/deliveries/${job.deliveryId}/locations`, {
      points: [
        { latitude: 45.7, longitude: 9.665, recordedAt: new Date(Date.now() - 30_000).toISOString(), accuracyMeters: 8 },
        { latitude: 45.698, longitude: 9.667, recordedAt: new Date().toISOString(), accuracyMeters: 6 },
      ],
    });
    assert.ok(eta.etaAt);

    // Customer sees progress, location and ETA.
    const tracking = await customer.get<OrderDetail>(`/orders/${orderId}`);
    assert.equal(tracking.status, 'IN_TRANSIT');
    assert.deepEqual(tracking.delivery?.lastLocation, { latitude: 45.698, longitude: 9.667 });
    assert.ok(tracking.delivery?.etaAt);

    // Arrival, proof (must be an image), completion.
    await courier.user.post(`/courier/deliveries/${job.deliveryId}/arrive`);
    await courier.user.post(`/courier/deliveries/${job.deliveryId}/complete`, {}, 409); // no proof yet
    const notImage = await courier.user.raw('POST', `/courier/deliveries/${job.deliveryId}/proof`, Buffer.from('not an image'), { 'Content-Type': 'image/jpeg' });
    assert.equal(notImage.status, 400);
    const proof = await courier.user.raw('POST', `/courier/deliveries/${job.deliveryId}/proof`, JPEG, { 'Content-Type': 'image/jpeg', 'X-Latitude': '45.698', 'X-Longitude': '9.667' });
    assert.equal(proof.status, 201);
    assert.equal((await customer.raw('GET', `/orders/${orderId}/delivery-proof`)).status, 404, 'customer sees the photo only once delivered');
    await courier.user.post(`/courier/deliveries/${job.deliveryId}/complete`);
    const customerProof = await customer.raw('GET', `/orders/${orderId}/delivery-proof`);
    assert.equal(customerProof.status, 200);
    assert.deepEqual(Buffer.from(await customerProof.arrayBuffer()), JPEG);
    const stranger = await signUp('stranger');
    assert.equal((await stranger.raw('GET', `/orders/${orderId}/delivery-proof`)).status, 404, 'only the customer of the order');
    await courier.user.post(`/courier/deliveries/${job.deliveryId}/locations`, { points: [{ ...BERGAMO_CENTRE, recordedAt: new Date().toISOString() }] }, 409);

    const done = await customer.get<OrderDetail>(`/orders/${orderId}`);
    assert.equal(done.status, 'DELIVERED');
    assert.deepEqual(done.history.map((h) => h.to), [
      'PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'COURIER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED',
    ]);
    const proofImage = await admin.raw('GET', `/admin/deliveries/${job.deliveryId}/proof`);
    assert.equal(proofImage.status, 200);
    assert.ok(Buffer.from(await proofImage.arrayBuffer()).equals(JPEG));

    // Earnings: seller 5980 − 15% commission (897) = 5083; courier keeps the 590 delivery fee.
    const balances = await admin.get<{ items: PartnerBalance[] }>('/admin/balances');
    const sellerBalance = balances.items.find((b) => b.partnerId === shop.partner.id);
    assert.equal(sellerBalance?.unsettledMinor, 5083);
    assert.equal(balances.items.find((b) => b.partnerId === courier.partner.id)?.unsettledMinor, 590);

    // Settlement: created once, paid with a bank reference; entries cannot be settled twice.
    const settlement = await admin.post<SettlementView>('/admin/settlements', { partnerId: shop.partner.id }, 201);
    assert.equal(settlement.totalMinor, 5083);
    assert.equal(settlement.entryCount, 2);
    await admin.post('/admin/settlements', { partnerId: shop.partner.id }, 409);
    await admin.post(`/admin/settlements/${settlement.id}/status`, { status: 'PAID' }, 409); // must be PROCESSING first
    await admin.post(`/admin/settlements/${settlement.id}/status`, { status: 'PROCESSING' });
    await admin.post(`/admin/settlements/${settlement.id}/status`, { status: 'PAID' }, 400); // reference required
    const paid = await admin.post<SettlementView>(`/admin/settlements/${settlement.id}/status`, { status: 'PAID', externalReference: 'SEPA-2026-0001' });
    assert.equal(paid.status, 'PAID');
    const earnings = await shop.user.get<{ balanceMinor: number; settlements: SettlementView[] }>('/seller/earnings');
    assert.equal(earnings.balanceMinor, 0);
    assert.equal(earnings.settlements[0]?.status, 'PAID');

    // The ledger is append-only, even for direct SQL.
    await assert.rejects(db.query('UPDATE ledger_entries SET amount_minor = 1'), /append-only/);
    await assert.rejects(db.query('UPDATE ledger_entries SET settlement_id = NULL WHERE settlement_id IS NOT NULL'), /already part of settlement/);
    await assert.rejects(db.query('DELETE FROM order_status_history'), /append-only/);

    // Notifications reached each party.
    const customerInbox = await customer.get<{ items: { type: string; title: string }[] }>('/me/notifications');
    for (const type of ['ORDER_PAID', 'ORDER_CONFIRMED', 'COURIER_ASSIGNED', 'COURIER_ARRIVING', 'ORDER_DELIVERED']) {
      assert.ok(customerInbox.items.some((n) => n.type === type), `customer missing ${type}`);
    }
    assert.equal(customerInbox.items.find((n) => n.type === 'ORDER_DELIVERED')?.title, 'Delivered', 'in the customer language (en)');
    const sellerInbox = await shop.user.get<{ items: { type: string; title: string }[] }>('/me/notifications');
    assert.equal(sellerInbox.items.find((n) => n.type === 'NEW_ORDER')?.title, 'Nuovo ordine', 'Italian by default');
  });
});

describe('secondary scenario: custom bouquet request', () => {
  it('collects offers, selects exactly one under concurrency, then delivers', async () => {
    const customer = await signUp('custom');
    const start = new Date(Date.now() + 24 * 3_600_000);
    const request = await customer.post<CustomRequestView>('/custom-requests', {
      occasion: 'Anniversary',
      flowerPreferences: 'Peonies, ranunculus',
      colourPreferences: 'Pastel pink and white',
      budgetMinor: 5000,
      deliveryWindowStart: start.toISOString(),
      deliveryWindowEnd: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
      recipientName: 'Anna Verdi',
      recipientPhone: '+393335554433',
      deliveryAddress: 'Via Pignolo 50, 24121 Bergamo BG',
      deliveryLocation: BERGAMO_CENTRE,
    }, 201);
    assert.equal(request.status, 'OPEN');

    // Both sellers in the zone see it and make offers.
    for (const seller of [shop, freelancer]) {
      const feed = await seller.user.get<{ items: CustomRequestView[] }>('/seller/custom-requests');
      assert.ok(feed.items.some((r) => r.id === request.id));
    }
    const availableFrom = new Date(Date.now() + 3_600_000).toISOString();
    await shop.user.post(`/seller/custom-requests/${request.id}/offer`, { description: 'Pastel peony bouquet, 25 stems', priceMinor: 4500, preparationMinutes: 90, availableFrom }, 201);
    await freelancer.user.post(`/seller/custom-requests/${request.id}/offer`, { description: 'Garden-style ranunculus and peonies', priceMinor: 4000, preparationMinutes: 120, availableFrom }, 201);

    const withOffers = await customer.get<CustomRequestView>(`/custom-requests/${request.id}`);
    assert.equal(withOffers.offers.length, 2);
    const cheapest = withOffers.offers[0];
    const other = withOffers.offers[1];
    assert.ok(cheapest && other);
    assert.equal(cheapest.sellerId, freelancer.partner.id);

    // Two selections at once (double tap / two devices): exactly one order is created.
    const results = await Promise.all([
      customer.raw('POST', `/custom-requests/${request.id}/offers/${cheapest.id}/select`),
      customer.raw('POST', `/custom-requests/${request.id}/offers/${other.id}/select`),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const winner = results.find((r) => r.status === 201) as Response;
    const checkout = (await winner.json()) as CheckoutResponse;
    const orders = await db.query('SELECT count(*)::int AS n FROM orders WHERE custom_offer_id IN ($1, $2)', [cheapest.id, other.id]);
    assert.equal(orders.rows[0].n, 1);

    const winningSeller = checkout.order.sellerId === freelancer.partner.id ? freelancer : shop;
    await pay(checkout);
    await winningSeller.user.post(`/seller/orders/${checkout.order.id}/accept`);
    await winningSeller.user.post(`/seller/orders/${checkout.order.id}/prepare`);
    await winningSeller.user.post(`/seller/orders/${checkout.order.id}/ready`);
    const job = (await courier.user.get<{ items: CourierJob[] }>('/courier/jobs/offered')).items.find((j) => j.orderNumber === checkout.order.orderNumber);
    assert.ok(job);
    await deliver(courier.user, job.deliveryId);

    assert.equal((await customer.get<OrderDetail>(`/orders/${checkout.order.id}`)).status, 'DELIVERED');
    const earnings = await winningSeller.user.get<{ entries: { orderId: string | null; amountMinor: number }[] }>('/seller/earnings');
    const net = earnings.entries.filter((e) => e.orderId === checkout.order.id).reduce((sum, e) => sum + e.amountMinor, 0);
    assert.equal(net, checkout.order.subtotalMinor - Math.floor((checkout.order.subtotalMinor * 1500 + 5000) / 10_000));
  });
});

describe('authorization and safety rules', () => {
  it('an unapproved partner can complete onboarding but not sell', async () => {
    const applicant = await signUp('applicant');
    const account = await applicant.post<PartnerAccount>('/partner/accounts', { kind: 'FREELANCE_SELLER', displayName: 'Fiori di Ada', phone: '+393331234567' }, 201);
    await applicant.post(`/partner/accounts/${account.id}/submit`, {}, 400); // incomplete profile
    await applicant.raw('PATCH', `/partner/accounts/${account.id}`, JSON.stringify({ address: 'Via Roma 1, Bergamo', location: CITTA_ALTA }), { 'Content-Type': 'application/json' });
    const submitted = await applicant.post<PartnerAccount>(`/partner/accounts/${account.id}/submit`);
    assert.equal(submitted.verificationStatus, 'SUBMITTED');
    await applicant.get('/seller/products', 403);
    await applicant.get('/seller/orders', 403);
    await applicant.get('/courier/jobs', 403);
    assert.equal((await applicant.get<{ items: PartnerAccount[] }>('/partner/accounts')).items.length, 1);
  });

  it('customers cannot reach admin, seller or other customers\' data', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');
    await alice.get('/admin/users', 403);
    await alice.get('/admin/balances', 403);
    await alice.post('/admin/settlements', { partnerId: shop.partner.id }, 403);
    await alice.get('/seller/orders', 403);

    await alice.put('/cart/items', { productId: rose.id, quantity: 1 });
    const checkout = await alice.post<CheckoutResponse>('/checkout', { recipientName: 'X Y', recipientPhone: '+393331234567', deliveryAddress: 'Via Roma 1, Bergamo', deliveryLocation: BERGAMO_CENTRE }, 201);
    await bob.get(`/orders/${checkout.order.id}`, 404);
    await bob.post(`/orders/${checkout.order.id}/cancel`, { reason: 'not mine' }, 404);
    await freelancer.user.get(`/seller/orders/${checkout.order.id}`, 404);
    await courier.user.post('/admin/partners/' + shop.partner.id + '/review', { status: 'SUSPENDED' }, 403);
  });

  it('checkout requires a verified email', async () => {
    const unverified = await signUp('unverified', false);
    await unverified.put('/cart/items', { productId: rose.id, quantity: 1 });
    await unverified.post('/checkout', { recipientName: 'X Y', recipientPhone: '+393331234567', deliveryAddress: 'Via Roma 1, Bergamo', deliveryLocation: BERGAMO_CENTRE }, 403);
  });

  it('a paid order cancelled by the customer is refunded and its stock released', async () => {
    const customer = await signUp('refund');
    const stockBefore = (await db.query<{ stock: number }>('SELECT stock FROM products WHERE id = $1', [rose.id])).rows[0]?.stock;
    await customer.put('/cart/items', { productId: rose.id, quantity: 1 });
    const checkout = await customer.post<CheckoutResponse>('/checkout', { recipientName: 'X Y', recipientPhone: '+393331234567', deliveryAddress: 'Via Roma 1, Bergamo', deliveryLocation: BERGAMO_CENTRE }, 201);
    await pay(checkout);
    const cancelled = await customer.post<OrderDetail>(`/orders/${checkout.order.id}/cancel`, { reason: 'Changed my mind' });
    assert.equal(cancelled.status, 'REFUNDED');
    assert.equal(cancelled.paymentStatus, 'REFUNDED');
    const stockAfter = (await db.query<{ stock: number }>('SELECT stock FROM products WHERE id = $1', [rose.id])).rows[0]?.stock;
    assert.equal(stockAfter, stockBefore);
    const refunds = await db.query('SELECT r.amount_minor FROM refunds r JOIN payments p ON p.id = r.payment_id WHERE p.order_id = $1', [checkout.order.id]);
    assert.equal(refunds.rows[0]?.amount_minor, checkout.order.totalMinor);
  });

  it('unpaid orders expire and release stock (maintenance job)', async () => {
    const customer = await signUp('expire');
    await customer.put('/cart/items', { productId: rose.id, quantity: 1 });
    const checkout = await customer.post<CheckoutResponse>('/checkout', { recipientName: 'X Y', recipientPhone: '+393331234567', deliveryAddress: 'Via Roma 1, Bergamo', deliveryLocation: BERGAMO_CENTRE }, 201);
    await db.query(`UPDATE orders SET created_at = now() - interval '2 hours' WHERE id = $1`, [checkout.order.id]);
    const result = await app.get(MaintenanceService).runOnce();
    assert.ok(result.expiredOrders >= 1);
    assert.equal((await customer.get<OrderDetail>(`/orders/${checkout.order.id}`)).status, 'CANCELLED');
    // A payment arriving after expiry is refunded automatically.
    await pay(checkout);
    assert.equal((await customer.get<OrderDetail>(`/orders/${checkout.order.id}`)).status, 'REFUNDED');
  });

  it('a second courier cannot take an assigned job', async () => {
    const other = await approvedPartner(admin, 'COURIER', BERGAMO_CENTRE);
    const customer = await signUp('race');
    await customer.put('/cart/items', { productId: rose.id, quantity: 1 });
    const checkout = await customer.post<CheckoutResponse>('/checkout', { recipientName: 'X Y', recipientPhone: '+393331234567', deliveryAddress: 'Via Roma 1, Bergamo', deliveryLocation: BERGAMO_CENTRE }, 201);
    await pay(checkout);
    for (const step of ['accept', 'prepare', 'ready']) await shop.user.post(`/seller/orders/${checkout.order.id}/${step}`);
    const job = (await courier.user.get<{ items: CourierJob[] }>('/courier/jobs/offered')).items.find((j) => j.orderNumber === checkout.order.orderNumber);
    assert.ok(job);
    const [first, second] = await Promise.all([
      courier.user.raw('POST', `/courier/deliveries/${job.deliveryId}/accept`),
      other.user.raw('POST', `/courier/deliveries/${job.deliveryId}/accept`),
    ]);
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  });

  it('admin actions are audited; security events are visible to admins', async () => {
    const audit = await admin.get<{ items: { action: string }[] }>('/admin/audit-log');
    assert.ok(audit.items.some((entry) => entry.action === 'PARTNER_APPROVED'));
    assert.ok(audit.items.some((entry) => entry.action === 'SETTLEMENT_PAID'));
    const events = await admin.get<{ items: { type: string }[] }>('/admin/security-events');
    assert.ok(events.items.some((event) => event.type === 'REGISTERED'));
    const health = await admin.get<{ approvedSellers: number; approvedCouriers: number }>('/admin/health');
    assert.ok(health.approvedSellers >= 2 && health.approvedCouriers >= 1);
  });
});

describe('Stripe webhook', () => {
  it('only a correctly signed event marks the payment paid, once', async () => {
    const webhookSecret = `whsec_${randomBytes(16).toString('hex')}`;
    const stripeApp = await createApp({ ...config, payments: { provider: 'stripe', stripeSecretKey: 'sk_test_flowermanintegration', stripeWebhookSecret: webhookSecret } });
    await stripeApp.listen(0, '127.0.0.1');
    const stripeBase = `http://127.0.0.1:${(stripeApp.getHttpServer().address() as AddressInfo).port}/${API_PREFIX}`;
    try {
      const customer = await signUp('stripe');
      await customer.put('/cart/items', { productId: rose.id, quantity: 1 });
      const checkout = await customer.post<CheckoutResponse>('/checkout', { recipientName: 'X Y', recipientPhone: '+393331234567', deliveryAddress: 'Via Roma 1, Bergamo', deliveryLocation: BERGAMO_CENTRE }, 201);
      const intentId = `pi_${randomBytes(12).toString('hex')}`;
      await db.query(`UPDATE payments SET provider = 'STRIPE', provider_ref = $2 WHERE order_id = $1`, [checkout.order.id, intentId]);

      const payload = JSON.stringify({
        id: `evt_${randomBytes(8).toString('hex')}`,
        object: 'event',
        type: 'payment_intent.succeeded',
        data: { object: { id: intentId, object: 'payment_intent', amount_received: checkout.order.totalMinor } },
      });
      const stripe = new Stripe('sk_test_flowermanintegration');
      const send = (signature: string) =>
        fetch(`${stripeBase}/payments/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature }, body: payload });

      const forged = await send(stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_wrong' }));
      assert.equal(forged.status, 400);
      assert.equal((await customer.get<OrderDetail>(`/orders/${checkout.order.id}`)).status, 'PENDING_PAYMENT');

      const signed = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
      assert.equal((await send(signed)).status, 200);
      assert.equal((await send(signed)).status, 200); // duplicate delivery is ignored
      const order = await customer.get<OrderDetail>(`/orders/${checkout.order.id}`);
      assert.equal(order.status, 'PAID');
      assert.equal(order.history.filter((h) => h.to === 'PAID').length, 1);

      const simulated = await fetch(`${stripeBase}/payments/simulated/sim_pi_${'0'.repeat(32)}/succeed`, { method: 'POST' });
      assert.equal(simulated.status, 403, 'the simulator is disabled when Stripe is the provider');
    } finally {
      await stripeApp.close();
    }
  });
});

describe('platform owner bootstrap', () => {
  it('creates the owner once and is idempotent', async () => {
    const run = promisify(execFile);
    const cli = resolve(import.meta.dirname, '../cli/bootstrap-platform-owner.js');
    const env = {
      ...process.env,
      DATABASE_URL: database.config.connectionString,
      DATABASE_SSL: 'false',
      PLATFORM_OWNER_EMAIL: 'owner@flowerman.example',
      PLATFORM_OWNER_PASSWORD: 'a very long owner secret 42',
      PLATFORM_OWNER_NAME: 'Owner',
    };
    assert.match((await run(process.execPath, [cli], { env })).stdout, /created/);
    assert.match((await run(process.execPath, [cli], { env })).stdout, /already existed/);
    const caps = await db.query<{ capability: string }>(
      `SELECT capability FROM user_capabilities c JOIN users u ON u.id = c.user_id WHERE u.email_normalized = 'owner@flowerman.example' ORDER BY 1`,
    );
    assert.deepEqual(caps.rows.map((r) => r.capability), ['PLATFORM_ADMIN', 'PLATFORM_OWNER']);
    const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@flowerman.example', password: 'a very long owner secret 42' }) });
    const tokens = (await login.json()) as AuthTokensResponse;
    const owner = client(tokens.accessToken, tokens.user.id);
    await owner.get('/admin/health');
    await assert.rejects(run(process.execPath, [cli], { env: { ...env, PLATFORM_OWNER_PASSWORD: 'short' } }));
  });
});

describe('product photos', () => {
  it('lets the seller upload a photo that anyone can load, and checks the bytes', async () => {
    const upload = (who: Client, productId: string, body: Buffer, type = 'image/jpeg') =>
      who.raw('PUT', `/seller/products/${productId}/image`, body, { 'Content-Type': type });

    // Text pretending to be a JPEG is refused; so is another seller's product.
    assert.equal((await upload(shop.user, rose.id, Buffer.from('not an image'))).status, 400);
    assert.equal((await upload(freelancer.user, rose.id, JPEG)).status, 404);

    const response = await upload(shop.user, rose.id, JPEG);
    assert.equal(response.status, 200, await response.clone().text());
    const updated = (await response.json()) as Product;
    assert.match(updated.imagePath ?? '', new RegExp(`^catalog/products/${rose.id}/image\\?v=\\d+$`));

    // Public, typed from the bytes, cacheable per version.
    const image = await fetch(`${base}/${updated.imagePath}`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/jpeg');
    assert.match(image.headers.get('cache-control') ?? '', /immutable/);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), JPEG);

    // A new photo gets a new version; the catalogue shows it.
    await new Promise((r) => setTimeout(r, 5));
    const second = (await (await upload(shop.user, rose.id, JPEG)).json()) as Product;
    assert.notEqual(second.imagePath, updated.imagePath);
    const listed = await shop.user.get<{ items: Product[] }>('/seller/products');
    assert.equal(listed.items.find((p) => p.id === rose.id)?.imagePath, second.imagePath);
    assert.equal((await fetch(`${base}/catalog/products/${randomUUID()}/image`)).status, 404);
  });
});


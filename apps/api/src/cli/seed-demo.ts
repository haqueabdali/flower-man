// Development only: fills the local database with a ready-to-test Bergamo marketplace. Idempotent.
//   pnpm db:seed:demo        (runs the Platform Owner bootstrap first)
// Creates approved demo partners (shop, freelance seller, courier), their products, and a demo customer,
// all through the real HTTP API, so every business rule applies. Refuses to run with NODE_ENV=production.
import 'reflect-metadata';

import type { AddressInfo } from 'node:net';

import type { AuthTokensResponse, PartnerAccount, PartnerKind, Product, ProductRequest } from '@flower-man/contracts';
import pg from 'pg';

import { API_PREFIX, createApp } from '../app.factory.js';
import { loadAppConfig } from '../config/app-config.js';
import { ConfigError } from '../config/config-error.js';

/** Shared by every demo account. Local development data only (production is refused). */
export const DEMO_PASSWORD = 'flowerman-demo-2026';

interface DemoPartner {
  readonly email: string;
  readonly fullName: string;
  readonly kind: PartnerKind;
  readonly displayName: string;
  readonly address: string;
  readonly location: { latitude: number; longitude: number };
  readonly products: readonly ProductRequest[];
  readonly openingHours?: Readonly<Record<string, string>>;
}

const product = (name: string, category: ProductRequest['category'], priceMinor: number, description: string, stock = 20): ProductRequest => ({
  name,
  category,
  priceMinor,
  description,
  stock,
  available: true,
});

const PARTNERS: readonly DemoPartner[] = [
  {
    email: 'demo.shop@flowerman.localhost',
    fullName: 'Chiara Colombo',
    kind: 'SHOP',
    displayName: 'Fiori di Città Alta',
    address: 'Via Gombito 12, 24129 Bergamo BG',
    location: { latitude: 45.7037, longitude: 9.6623 },
    openingHours: { mon: '15:00-19:30', tue: '09:00-19:30', wed: '09:00-19:30', thu: '09:00-19:30', fri: '09:00-19:30', sat: '09:00-19:30', sun: 'closed' },
    products: [
      product('Dozen red roses', 'ROSES', 2990, 'Twelve long-stem red roses, hand-tied.'),
      product('Spring bouquet', 'BOUQUET', 3490, 'Tulips, ranunculus and seasonal greenery.'),
      product('White orchid', 'PLANTS', 3990, 'Phalaenopsis in a ceramic pot.', 8),
      product('Sunflower arrangement', 'ARRANGEMENT', 4590, 'Sunflowers and chamomile in a basket.', 10),
      product('Condolence wreath', 'FUNERAL', 8900, 'White lilies and roses, 60 cm.', 4),
    ],
  },
  {
    email: 'demo.freelancer@flowerman.localhost',
    fullName: 'Luca Ferrari',
    kind: 'FREELANCE_SELLER',
    displayName: 'Luca – fiori di campo',
    address: 'Via Borgo Palazzo 80, 24125 Bergamo BG',
    location: { latitude: 45.6937, longitude: 9.6889 },
    products: [
      product('Wildflower bunch', 'BOUQUET', 1890, 'Seasonal wildflowers wrapped in paper.', 15),
      product('Mini succulent box', 'GIFT', 2290, 'Three succulents in a wooden box.', 12),
    ],
  },
  {
    email: 'demo.courier@flowerman.localhost',
    fullName: 'Marco Bianchi',
    kind: 'COURIER',
    displayName: 'Marco (bike courier)',
    address: 'Piazza Matteotti 1, 24122 Bergamo BG',
    location: { latitude: 45.6949, longitude: 9.6699 },
    products: [],
  },
];

const CUSTOMER = { email: 'demo.customer@flowerman.localhost', fullName: 'Giulia Rossi' };

class Api {
  constructor(
    private readonly base: string,
    private readonly token?: string,
  ) {}

  as(token: string): Api {
    return new Api(this.base, token);
  }

  async call<T>(method: string, path: string, body?: unknown, allowed: readonly number[] = [200, 201, 204]): Promise<{ status: number; data: T }> {
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!allowed.includes(response.status)) {
      throw new Error(`${method} ${path} → HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    return { status: response.status, data: (text ? JSON.parse(text) : undefined) as T };
  }
}

/** Signs in, or registers the account first. Demo accounts get a verified email. */
async function account(api: Api, db: pg.Pool, email: string, fullName: string, password = DEMO_PASSWORD): Promise<{ api: Api; userId: string; created: boolean }> {
  const login = await api.call<AuthTokensResponse>('POST', '/auth/login', { email, password }, [200, 401]);
  let tokens = login.status === 200 ? login.data : undefined;
  let created = false;
  if (!tokens) {
    tokens = (await api.call<AuthTokensResponse>('POST', '/auth/register', { email, password, fullName }, [201])).data;
    created = true;
  }
  await db.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [tokens.user.id]);
  return { api: api.as(tokens.accessToken), userId: tokens.user.id, created };
}

async function main(): Promise<void> {
  const config = loadAppConfig(process.env);
  if (config.nodeEnv === 'production') {
    throw new ConfigError('db:seed:demo is for local development only and refuses NODE_ENV=production.');
  }
  const ownerEmail = process.env.PLATFORM_OWNER_EMAIL?.trim();
  const ownerPassword = process.env.PLATFORM_OWNER_PASSWORD ?? '';
  if (!ownerEmail || !ownerPassword) {
    throw new ConfigError('Set PLATFORM_OWNER_EMAIL and PLATFORM_OWNER_PASSWORD (.env) and run pnpm bootstrap:platform-owner first.');
  }

  // A private in-process API on a random local port; registrations in a row must not hit the per-IP limit.
  const app = await createApp({
    ...config,
    rateLimitStore: 'memory',
    auth: { ...config.auth, rateLimits: { ...config.auth.rateLimits, registerPerIp: { limit: 1_000, windowMs: 60_000 } } },
  });
  await app.listen(0, '127.0.0.1');
  const api = new Api(`http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/${API_PREFIX}`);
  const db = new pg.Pool({ connectionString: config.database.connectionString, ssl: config.database.ssl, max: 2 });

  try {
    const owner = await api.call<AuthTokensResponse>('POST', '/auth/login', { email: ownerEmail, password: ownerPassword }, [200, 401]);
    if (owner.status !== 200) {
      throw new ConfigError('The Platform Owner cannot sign in. Run pnpm bootstrap:platform-owner (password from .env).');
    }
    const admin = api.as(owner.data.accessToken);
    const lines: string[] = [];

    for (const demo of PARTNERS) {
      const user = await account(api, db, demo.email, demo.fullName);
      const mine = (await user.api.call<{ items: PartnerAccount[] }>('GET', '/partner/accounts')).data.items;
      let partner = mine.find((p) => p.kind === demo.kind);
      if (!partner) {
        partner = (
          await user.api.call<PartnerAccount>('POST', '/partner/accounts', {
            kind: demo.kind,
            displayName: demo.displayName,
            phone: '+393331112233',
            address: demo.address,
            location: demo.location,
            ...(demo.kind === 'SHOP' ? { legalName: 'Fiori di Città Alta S.r.l.', vatNumber: 'IT12345678901' } : {}),
            ...(demo.openingHours ? { openingHours: demo.openingHours } : {}),
          })
        ).data;
      }
      if (demo.openingHours && Object.keys(partner.openingHours).length === 0) {
        partner = (await user.api.call<PartnerAccount>('PATCH', `/partner/accounts/${partner.id}`, { openingHours: demo.openingHours })).data;
      }
      if (partner.verificationStatus === 'DRAFT') {
        await user.api.call('POST', `/partner/accounts/${partner.id}/submit`);
      }
      if (partner.verificationStatus !== 'APPROVED') {
        await admin.call('POST', `/admin/partners/${partner.id}/review`, { status: 'APPROVED', notes: 'Demo data' });
      }
      let added = 0;
      if (demo.kind === 'COURIER') {
        await user.api.call('POST', '/partner/courier/availability', { available: true });
      } else {
        const existing = (await user.api.call<{ items: Product[] }>('GET', '/seller/products')).data.items;
        for (const item of demo.products) {
          if (!existing.some((p) => p.name === item.name)) {
            await user.api.call<Product>('POST', '/seller/products', item);
            added += 1;
          }
        }
      }
      lines.push(
        `  ${demo.kind.padEnd(16)} ${demo.email.padEnd(38)} ${demo.displayName}` +
          (demo.kind === 'COURIER' ? ' (online)' : ` (${demo.products.length} products${added ? `, ${added} new` : ''})`),
      );
    }

    await account(api, db, CUSTOMER.email, CUSTOMER.fullName);
    lines.push(`  ${'CUSTOMER'.padEnd(16)} ${CUSTOMER.email.padEnd(38)} ${CUSTOMER.fullName}`);

    console.log('✔ Demo marketplace ready (Bergamo). Password for every demo account:', DEMO_PASSWORD);
    console.log(lines.join('\n'));
    console.log(`  ${'ADMIN'.padEnd(16)} ${ownerEmail.padEnd(38)} (your PLATFORM_OWNER_PASSWORD)`);
  } finally {
    await db.end();
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? `✖ ${error.message}` : error);
  process.exitCode = 1;
});

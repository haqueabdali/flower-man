import { randomUUID } from 'node:crypto';

import Stripe from 'stripe';

import type { PaymentsConfig } from '../config/app-config.js';

export interface CreatedIntent {
  readonly reference: string;
  readonly clientSecret: string | null;
}

/** Abstraction over the payment processor. Success is never reported here: it arrives via webhook/confirmation. */
export interface PaymentProvider {
  readonly name: 'SIMULATED' | 'STRIPE';
  createIntent(input: { orderId: string; amountMinor: number; currency: 'EUR' }): Promise<CreatedIntent>;
  refund(input: { reference: string; amountMinor: number; idempotencyKey: string }): Promise<{ reference: string }>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Development and tests only (config refuses it in production). */
export class SimulatedPaymentProvider implements PaymentProvider {
  readonly name = 'SIMULATED' as const;

  async createIntent(): Promise<CreatedIntent> {
    return { reference: `sim_pi_${randomUUID().replaceAll('-', '')}`, clientSecret: null };
  }

  async refund(): Promise<{ reference: string }> {
    return { reference: `sim_re_${randomUUID().replaceAll('-', '')}` };
  }
}

export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'STRIPE' as const;

  constructor(private readonly stripe: Stripe) {}

  async createIntent(input: { orderId: string; amountMinor: number; currency: 'EUR' }): Promise<CreatedIntent> {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: input.amountMinor,
        currency: input.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: { orderId: input.orderId },
      },
      // Same order → same PaymentIntent, even if the request is retried.
      { idempotencyKey: `order-${input.orderId}` },
    );
    return { reference: intent.id, clientSecret: intent.client_secret };
  }

  async refund(input: { reference: string; amountMinor: number; idempotencyKey: string }): Promise<{ reference: string }> {
    const refund = await this.stripe.refunds.create(
      { payment_intent: input.reference, amount: input.amountMinor },
      { idempotencyKey: input.idempotencyKey },
    );
    return { reference: refund.id };
  }
}

export function createStripeClient(config: PaymentsConfig): Stripe | null {
  return config.stripeSecretKey ? new Stripe(config.stripeSecretKey, { maxNetworkRetries: 2, timeout: 20_000 }) : null;
}

export function createPaymentProvider(config: PaymentsConfig): PaymentProvider {
  if (config.provider === 'stripe') {
    const stripe = createStripeClient(config);
    if (!stripe) {
      throw new Error('STRIPE_SECRET_KEY missing');
    }
    return new StripePaymentProvider(stripe);
  }
  return new SimulatedPaymentProvider();
}

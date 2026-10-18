import { BadRequestException, Controller, ForbiddenException, Headers, HttpCode, HttpStatus, Inject, NotFoundException, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type Stripe from 'stripe';

import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { STRIPE_CLIENT } from './payments.module-tokens.js';
import { PaymentsService } from './payments.service.js';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
  ) {}

  /**
   * Stripe webhook: the ONLY way a real payment is marked successful. The signature is verified
   * against the raw request body with STRIPE_WEBHOOK_SECRET; unsigned or tampered events get 400.
   */
  @Post('stripe/webhook')
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(@Req() request: Request, @Headers('stripe-signature') signature?: string): Promise<{ received: true }> {
    if (!this.stripe || !this.config.payments.stripeWebhookSecret) {
      throw new NotFoundException();
    }
    const raw: unknown = request.body;
    if (!Buffer.isBuffer(raw) || !signature) {
      throw new BadRequestException('Missing signature or body.');
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(raw, signature, this.config.payments.stripeWebhookSecret);
    } catch {
      throw new BadRequestException('Invalid webhook signature.');
    }
    if (!(await this.payments.firstTimeSeen('STRIPE', event.id, event.type))) {
      return { received: true };
    }
    try {
      if (event.type === 'payment_intent.succeeded') {
        await this.payments.markSucceeded(event.data.object.id, event.data.object.amount_received);
      } else if (event.type === 'payment_intent.payment_failed') {
        await this.payments.markFailed(event.data.object.id, event.data.object.last_payment_error?.message ?? 'Payment failed');
      }
    } catch (error) {
      // Let Stripe retry: forget the event so the retry is processed.
      await this.payments.forgetEvent('STRIPE', event.id);
      throw error;
    }
    return { received: true };
  }

  /** Development/test only: simulates the provider confirming (or declining) a payment. */
  @Post('simulated/:reference/:outcome')
  @HttpCode(HttpStatus.NO_CONTENT)
  async simulate(@Param('reference') reference: string, @Param('outcome') outcome: string): Promise<void> {
    if (this.config.payments.provider !== 'simulated' || this.config.nodeEnv === 'production') {
      throw new ForbiddenException('Simulated payments are disabled.');
    }
    if (!/^sim_pi_[0-9a-f]{32}$/.test(reference)) {
      throw new BadRequestException('Invalid reference.');
    }
    const payment = await this.payments.amountFor(reference);
    if (outcome === 'succeed') {
      await this.payments.markSucceeded(reference, payment);
    } else if (outcome === 'fail') {
      await this.payments.markFailed(reference, 'Simulated decline');
    } else {
      throw new BadRequestException('outcome must be succeed or fail.');
    }
  }
}

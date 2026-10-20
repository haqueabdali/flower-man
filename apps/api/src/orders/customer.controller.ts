import {
  type Cart,
  type CartItemRequest,
  cartItemSchema,
  cancelOrderSchema,
  type CheckoutRequest,
  type CheckoutResponse,
  checkoutSchema,
  type CreateCustomRequest,
  createCustomRequestSchema,
  type CustomRequestView,
  type OrderDetail,
  type OrderSummary,
  type PaymentInstructions,
  type ReviewOrderRequest,
  reviewOrderSchema,
} from '@flower-man/contracts';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, Put, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { type AuthenticatedContext, AuthGuard, CurrentAuth, RequireCapabilities } from '../auth/auth.guard.js';
import { UuidPipe } from '../common/uuid-param.pipe.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { CustomRequestsService } from '../custom-requests/custom-requests.service.js';
import { DeliveryService } from '../delivery/delivery.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';
import { CommerceService } from './commerce.service.js';

/** Customer-facing commerce. Every route acts only on the signed-in customer's own data. */
@Controller()
@UseGuards(AuthGuard)
@RequireCapabilities('CUSTOMER')
export class CustomerController {
  constructor(
    private readonly commerce: CommerceService,
    private readonly customRequests: CustomRequestsService,
    private readonly delivery: DeliveryService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get('cart')
  async cart(@CurrentAuth() auth: AuthenticatedContext): Promise<Cart> {
    return this.commerce.getCart(auth.userId);
  }

  @Put('cart/items')
  async setItem(@CurrentAuth() auth: AuthenticatedContext, @Body(new ZodBodyPipe(cartItemSchema)) body: CartItemRequest): Promise<Cart> {
    return this.commerce.setItem(auth.userId, body);
  }

  @Delete('cart/items/:productId')
  async removeItem(@CurrentAuth() auth: AuthenticatedContext, @Param('productId', UuidPipe) productId: string): Promise<Cart> {
    return this.commerce.removeItem(auth.userId, productId);
  }

  @Delete('cart')
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(@CurrentAuth() auth: AuthenticatedContext): Promise<void> {
    await this.commerce.clearCart(auth.userId);
  }

  @Post('checkout')
  async checkout(@CurrentAuth() auth: AuthenticatedContext, @Body(new ZodBodyPipe(checkoutSchema)) body: CheckoutRequest): Promise<CheckoutResponse> {
    return this.commerce.checkout(auth, body);
  }

  @Get('orders')
  async orders(@CurrentAuth() auth: AuthenticatedContext): Promise<{ items: OrderSummary[] }> {
    return { items: await this.commerce.customerOrders(auth.userId) };
  }

  @Get('orders/:id')
  async order(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<OrderDetail> {
    return this.commerce.customerOrder(auth.userId, id);
  }

  /** The courier's proof photo, for the customer of that order, once it is delivered. */
  @Get('orders/:id/delivery-proof')
  async deliveryProof(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Res() response: Response): Promise<void> {
    const order = await this.commerce.customerOrder(auth.userId, id);
    if (!order.delivery || order.delivery.status !== 'DELIVERED') {
      throw new NotFoundException('No delivery photo for this order yet.');
    }
    const { bytes, contentType } = await this.delivery.proofImage(order.delivery.id);
    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'");
    response.send(bytes);
  }

  @Post('orders/:id/review')
  @HttpCode(HttpStatus.NO_CONTENT)
  async review(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Body(new ZodBodyPipe(reviewOrderSchema)) body: ReviewOrderRequest): Promise<void> {
    await this.reviews.review(auth.userId, id, body);
  }

  @Post('orders/:id/pay')
  @HttpCode(HttpStatus.OK)
  async pay(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<PaymentInstructions> {
    return this.commerce.customerPay(auth.userId, id);
  }

  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodBodyPipe(cancelOrderSchema)) body: { reason: string },
  ): Promise<OrderDetail> {
    return this.commerce.customerCancel(auth.userId, id, body.reason);
  }

  @Post('custom-requests')
  async createRequest(
    @CurrentAuth() auth: AuthenticatedContext,
    @Body(new ZodBodyPipe(createCustomRequestSchema)) body: CreateCustomRequest,
  ): Promise<CustomRequestView> {
    return this.customRequests.create(auth, body);
  }

  @Get('custom-requests')
  async requests(@CurrentAuth() auth: AuthenticatedContext): Promise<{ items: CustomRequestView[] }> {
    return { items: await this.customRequests.listForCustomer(auth.userId) };
  }

  @Get('custom-requests/:id')
  async request(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<CustomRequestView> {
    return this.customRequests.getForCustomer(auth.userId, id);
  }

  @Post('custom-requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelRequest(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<CustomRequestView> {
    return this.customRequests.cancel(auth.userId, id);
  }

  @Post('custom-requests/:id/offers/:offerId/select')
  async selectOffer(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('id', UuidPipe) id: string,
    @Param('offerId', UuidPipe) offerId: string,
  ): Promise<CheckoutResponse> {
    return this.customRequests.selectOffer(auth, id, offerId);
  }
}

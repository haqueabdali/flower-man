import {
  type CustomOffer,
  type CustomOfferRequest,
  customOfferSchema,
  type CustomRequestView,
  type LedgerEntryView,
  type OrderDetail,
  type OrderSummary,
  type PublicReview,
  type Rating,
  type SettlementView,
  sellerRejectSchema,
} from '@flower-man/contracts';
import { ORDER_STATUSES } from '@flower-man/domain';
import { BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { type AuthenticatedContext, AuthGuard, CurrentAuth } from '../auth/auth.guard.js';
import { UuidPipe } from '../common/uuid-param.pipe.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { CustomRequestsService } from '../custom-requests/custom-requests.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { PartnersService, SELLER_HEADER } from '../partners/partners.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';
import { CommerceService } from './commerce.service.js';

/** Shops and freelance sellers. Access requires an APPROVED seller account (checked per request). */
@Controller('seller')
@UseGuards(AuthGuard)
export class SellerController {
  constructor(
    private readonly partners: PartnersService,
    private readonly commerce: CommerceService,
    private readonly customRequests: CustomRequestsService,
    private readonly ledger: LedgerService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get('orders')
  async orders(@CurrentAuth() auth: AuthenticatedContext, @Query('status') status?: string, @Headers(SELLER_HEADER) sellerId?: string): Promise<{ items: OrderSummary[] }> {
    if (status !== undefined && !(ORDER_STATUSES as readonly string[]).includes(status)) {
      throw new BadRequestException('Unknown status.');
    }
    return { items: await this.commerce.sellerOrders(await this.partners.requireSeller(auth.userId, sellerId), status) };
  }

  @Get('orders/:id')
  async order(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Headers(SELLER_HEADER) sellerId?: string): Promise<OrderDetail> {
    return this.commerce.sellerOrder(await this.partners.requireSeller(auth.userId, sellerId), id);
  }

  @Post('orders/:id/accept')
  @HttpCode(HttpStatus.OK)
  async accept(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Headers(SELLER_HEADER) sellerId?: string): Promise<OrderDetail> {
    return this.commerce.sellerAdvance(await this.partners.requireSeller(auth.userId, sellerId), auth.userId, id, 'CONFIRMED');
  }

  @Post('orders/:id/prepare')
  @HttpCode(HttpStatus.OK)
  async prepare(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Headers(SELLER_HEADER) sellerId?: string): Promise<OrderDetail> {
    return this.commerce.sellerAdvance(await this.partners.requireSeller(auth.userId, sellerId), auth.userId, id, 'PREPARING');
  }

  @Post('orders/:id/ready')
  @HttpCode(HttpStatus.OK)
  async ready(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Headers(SELLER_HEADER) sellerId?: string): Promise<OrderDetail> {
    return this.commerce.sellerAdvance(await this.partners.requireSeller(auth.userId, sellerId), auth.userId, id, 'READY_FOR_PICKUP');
  }

  @Post('orders/:id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodBodyPipe(sellerRejectSchema)) body: { reason: string },
    @Headers(SELLER_HEADER) sellerId?: string,
  ): Promise<OrderDetail> {
    return this.commerce.sellerReject(await this.partners.requireSeller(auth.userId, sellerId), auth.userId, id, body.reason);
  }

  @Get('custom-requests')
  async customRequestFeed(@CurrentAuth() auth: AuthenticatedContext, @Headers(SELLER_HEADER) sellerId?: string): Promise<{ items: (CustomRequestView & { myOffer: CustomOffer | null })[] }> {
    return { items: await this.customRequests.openForSeller(await this.partners.requireSeller(auth.userId, sellerId)) };
  }

  @Post('custom-requests/:id/offer')
  async offer(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodBodyPipe(customOfferSchema)) body: CustomOfferRequest,
    @Headers(SELLER_HEADER) sellerId?: string,
  ): Promise<CustomOffer> {
    return this.customRequests.submitOffer(await this.partners.requireSeller(auth.userId, sellerId), id, body);
  }

  /** Raw image bytes (JPEG, PNG or WebP, max 5 MB) for the seller's own open offer. */
  @Put('custom-requests/:id/offer/image')
  async offerImage(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Req() request: Request, @Headers(SELLER_HEADER) sellerId?: string): Promise<CustomOffer> {
    return this.customRequests.setOfferImage(await this.partners.requireSeller(auth.userId, sellerId), id, request.body);
  }

  @Post('custom-requests/:id/offer/withdraw')
  @HttpCode(HttpStatus.NO_CONTENT)
  async withdraw(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Headers(SELLER_HEADER) sellerId?: string): Promise<void> {
    await this.customRequests.withdrawOffer(await this.partners.requireSeller(auth.userId, sellerId), id);
  }

  @Get('reviews')
  async myReviews(@CurrentAuth() auth: AuthenticatedContext, @Headers(SELLER_HEADER) sellerId?: string): Promise<{ rating: Rating | null; items: PublicReview[] }> {
    return this.reviews.forSeller((await this.partners.requireSeller(auth.userId, sellerId)).partnerId);
  }

  @Get('earnings')
  async earnings(
    @CurrentAuth() auth: AuthenticatedContext,
    @Headers(SELLER_HEADER) sellerId?: string,
  ): Promise<{ balanceMinor: number; entries: LedgerEntryView[]; settlements: SettlementView[] }> {
    const seller = await this.partners.requireSeller(auth.userId, sellerId);
    if (seller.role !== 'OWNER') {
      throw new BadRequestException('Only the owner can see earnings.');
    }
    return { ...(await this.ledger.entries(seller.partnerId)), settlements: await this.ledger.settlementsForPartner(seller.partnerId) };
  }
}

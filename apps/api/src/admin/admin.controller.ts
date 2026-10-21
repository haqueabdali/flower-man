import {
  type AdminUser,
  capabilityChangeSchema,
  cancelOrderSchema,
  type CreatePromoRequest,
  type CreateZoneRequest,
  createPromoSchema,
  createSettlementSchema,
  createZoneSchema,
  featurePartnerSchema,
  type AdminReview,
  type AdminSupportTicket,
  SUPPORT_STATUSES,
  supportMessageSchema,
  type SupportStatus,
  ANALYTICS_PERIODS,
  type CustomRequestView,
  type MarketplaceAnalytics,
  type MarketplaceHealth,
  type OrderDetail,
  type OrderSummary,
  type PartnerAccount,
  type PartnerBalance,
  type PromoCodeView,
  type RefundRequest,
  refundSchema,
  type ReviewPartnerRequest,
  reviewPartnerSchema,
  type ServiceZone,
  type SettlementTransitionRequest,
  settlementTransitionSchema,
  type SettlementView,
  type UpdateZoneRequest,
  updateZoneSchema,
  updatePromoSchema,
  userStatusSchema,
} from '@flower-man/contracts';
import { BadRequestException, Body, Controller, Get, HttpCode, Inject, HttpStatus, NotFoundException, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import pg from 'pg';
import { z } from 'zod';

import { type AuthenticatedContext, AuthGuard, CurrentAuth, RequireCapabilities } from '../auth/auth.guard.js';
import { recordAudit } from '../common/audit.js';
import { UuidPipe } from '../common/uuid-param.pipe.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { CustomRequestsService } from '../custom-requests/custom-requests.service.js';
import { PG_POOL } from '../database/database.module.js';
import { DeliveryService } from '../delivery/delivery.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { CommerceService } from '../orders/commerce.service.js';
import { PromoService } from '../orders/promo.service.js';
import { listOrders, loadOrderDetail } from '../orders/order-views.js';
import { PartnersService } from '../partners/partners.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';
import { SupportService } from '../support/support.service.js';
import { ZonesService } from '../zones/zones.service.js';
import { AdminService } from './admin.service.js';

const optionalText = (value: string | undefined) => (value && value.length <= 40 ? value : undefined);

/** Platform administration. Every route requires PLATFORM_ADMIN or PLATFORM_OWNER (enforced by the API). */
@Controller('admin')
@UseGuards(AuthGuard)
@RequireCapabilities('PLATFORM_ADMIN', 'PLATFORM_OWNER')
export class AdminController {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly admin: AdminService,
    private readonly partners: PartnersService,
    private readonly zones: ZonesService,
    private readonly commerce: CommerceService,
    private readonly payments: PaymentsService,
    private readonly delivery: DeliveryService,
    private readonly customRequests: CustomRequestsService,
    private readonly ledger: LedgerService,
    private readonly reviews: ReviewsService,
    private readonly promos: PromoService,
    private readonly support: SupportService,
  ) {}

  @Get('analytics')
  async analytics(@Query('days') days?: string): Promise<MarketplaceAnalytics> {
    const period = Number(days ?? 30);
    if (!(ANALYTICS_PERIODS as readonly number[]).includes(period)) {
      throw new BadRequestException(`days must be one of ${ANALYTICS_PERIODS.join(', ')}.`);
    }
    return this.admin.analytics(period);
  }

  @Get('health')
  async health(): Promise<MarketplaceHealth> {
    return this.admin.health();
  }

  // ---------------------------------------------------------------- users
  @Get('users')
  async users(@Query('q') q?: string): Promise<{ items: AdminUser[] }> {
    return { items: await this.admin.users(q) };
  }

  @Post('users/:id/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  async userStatus(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodBodyPipe(userStatusSchema)) body: { status: 'ACTIVE' | 'SUSPENDED'; reason: string },
  ): Promise<void> {
    await this.admin.setUserStatus(auth, id, body.status, body.reason);
  }

  @Post('users/:id/capabilities/grant')
  @HttpCode(HttpStatus.NO_CONTENT)
  async grant(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Body(new ZodBodyPipe(capabilityChangeSchema)) body: z.infer<typeof capabilityChangeSchema>): Promise<void> {
    await this.admin.changeCapability(auth, id, body.capability, true);
  }

  @Post('users/:id/capabilities/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Body(new ZodBodyPipe(capabilityChangeSchema)) body: z.infer<typeof capabilityChangeSchema>): Promise<void> {
    await this.admin.changeCapability(auth, id, body.capability, false);
  }

  // ---------------------------------------------------------------- partners
  @Get('partners')
  async partnerList(@Query('status') status?: string, @Query('kind') kind?: string): Promise<{ items: (PartnerAccount & { ownerEmail: string })[] }> {
    return { items: await this.partners.listForAdmin(optionalText(status), optionalText(kind)) };
  }

  @Post('partners/:id/review')
  @HttpCode(HttpStatus.NO_CONTENT)
  async review(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Body(new ZodBodyPipe(reviewPartnerSchema)) body: ReviewPartnerRequest): Promise<void> {
    await this.partners.review(auth.userId, id, body);
  }

  @Post('partners/:id/feature')
  @HttpCode(HttpStatus.NO_CONTENT)
  async feature(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Body(new ZodBodyPipe(featurePartnerSchema)) body: { days: number }): Promise<void> {
    await this.partners.feature(auth.userId, id, body.days);
  }

  // ---------------------------------------------------------------- zones
  @Get('zones')
  async zoneList(): Promise<{ items: ServiceZone[] }> {
    return { items: await this.zones.list() };
  }

  @Post('zones')
  async createZone(@CurrentAuth() auth: AuthenticatedContext, @Body(new ZodBodyPipe(createZoneSchema)) body: CreateZoneRequest): Promise<ServiceZone> {
    return this.zones.create(auth.userId, body);
  }

  @Patch('zones/:id')
  async updateZone(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Body(new ZodBodyPipe(updateZoneSchema)) body: UpdateZoneRequest): Promise<ServiceZone> {
    return this.zones.update(auth.userId, id, body);
  }

  // ---------------------------------------------------------------- orders, payments, deliveries
  @Get('orders')
  async orders(@Query('status') status?: string): Promise<{ items: OrderSummary[] }> {
    return { items: await listOrders(this.pool, '$1::text IS NULL OR o.status = $1', [optionalText(status) ?? null]) };
  }

  @Get('orders/:id')
  async order(@Param('id', UuidPipe) id: string): Promise<OrderDetail> {
    const detail = await loadOrderDetail(this.pool, id, 'true', null);
    if (!detail) {
      throw new NotFoundException('Order not found.');
    }
    return detail;
  }

  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelOrder(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Body(new ZodBodyPipe(cancelOrderSchema)) body: { reason: string }): Promise<OrderDetail> {
    await this.commerce.cancel(id, 'ADMIN', auth.userId, body.reason);
    await recordAudit(this.pool, auth.userId, 'ORDER_CANCELLED', 'order', id, { reason: body.reason });
    return this.order(id);
  }

  @Post('orders/:id/refund')
  @HttpCode(HttpStatus.OK)
  async refund(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Body(new ZodBodyPipe(refundSchema)) body: RefundRequest): Promise<OrderDetail> {
    await this.payments.refund(id, body.amountMinor ?? null, body.reason, auth.userId);
    return this.order(id);
  }

  @Get('payments')
  async paymentList(@Query('status') status?: string): Promise<{ items: unknown[] }> {
    return { items: await this.admin.payments(optionalText(status)) };
  }

  @Get('deliveries')
  async deliveryList(@Query('status') status?: string): Promise<{ items: unknown[] }> {
    return { items: await this.admin.deliveries(optionalText(status)) };
  }

  @Get('deliveries/:id/proof')
  async proof(@Param('id', UuidPipe) id: string, @Res() response: Response): Promise<void> {
    const { bytes, contentType } = await this.delivery.proofImage(id);
    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(bytes);
  }

  @Get('support')
  async supportList(@Query('status') status?: string): Promise<{ items: AdminSupportTicket[] }> {
    const filter = optionalText(status);
    if (filter && !(SUPPORT_STATUSES as readonly string[]).includes(filter)) {
      throw new BadRequestException('Unknown status.');
    }
    return { items: await this.support.listForAdmin(filter as SupportStatus | undefined) };
  }

  @Post('support/:id/reply')
  @HttpCode(HttpStatus.NO_CONTENT)
  async supportReply(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Body(new ZodBodyPipe(supportMessageSchema)) body: { body: string }): Promise<void> {
    await this.support.teamReply(auth.userId, id, body.body);
  }

  @Post('support/:id/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  async supportClose(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<void> {
    await this.support.close(auth.userId, id);
  }

  @Get('promo-codes')
  async promoCodes(): Promise<{ items: PromoCodeView[] }> {
    return { items: await this.promos.list() };
  }

  @Post('promo-codes')
  @HttpCode(HttpStatus.NO_CONTENT)
  async createPromo(@CurrentAuth() auth: AuthenticatedContext, @Body(new ZodBodyPipe(createPromoSchema)) body: CreatePromoRequest): Promise<void> {
    await this.promos.create(auth.userId, body);
  }

  @Patch('promo-codes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updatePromo(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Body(new ZodBodyPipe(updatePromoSchema)) body: { active: boolean }): Promise<void> {
    await this.promos.setActive(auth.userId, id, body.active);
  }

  @Get('reviews')
  async reviewList(): Promise<{ items: AdminReview[] }> {
    return { items: await this.reviews.listForAdmin() };
  }

  @Post('reviews/:orderId/hide')
  @HttpCode(HttpStatus.NO_CONTENT)
  async hideReview(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('orderId', UuidPipe) orderId: string,
    @Body(new ZodBodyPipe(cancelOrderSchema)) body: { reason: string },
  ): Promise<void> {
    await this.reviews.hide(auth.userId, orderId, body.reason);
  }

  @Get('custom-requests')
  async requests(@Query('status') status?: string): Promise<{ items: CustomRequestView[] }> {
    return { items: await this.customRequests.listForAdmin(optionalText(status)) };
  }

  // ---------------------------------------------------------------- earnings & settlements
  @Get('balances')
  async balances(): Promise<{ items: PartnerBalance[] }> {
    return { items: await this.ledger.balances() };
  }

  @Get('partners/:id/ledger')
  async partnerLedger(@Param('id', UuidPipe) id: string) {
    return { ...(await this.ledger.entries(id)), settlements: await this.ledger.settlementsForPartner(id) };
  }

  @Get('settlements')
  async settlements(@Query('status') status?: string): Promise<{ items: SettlementView[] }> {
    return { items: await this.ledger.listSettlements(optionalText(status)) };
  }

  @Post('settlements')
  async createSettlement(@CurrentAuth() auth: AuthenticatedContext, @Body(new ZodBodyPipe(createSettlementSchema)) body: { partnerId: string }): Promise<SettlementView> {
    return this.ledger.createSettlement(auth.userId, body.partnerId);
  }

  @Post('settlements/:id/status')
  @HttpCode(HttpStatus.OK)
  async settlementStatus(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodBodyPipe(settlementTransitionSchema)) body: SettlementTransitionRequest,
  ): Promise<SettlementView> {
    return this.ledger.transitionSettlement(auth.userId, id, body);
  }

  // ---------------------------------------------------------------- security & privacy
  @Get('security-events')
  async securityEvents(@Query('userId') userId?: string): Promise<{ items: unknown[] }> {
    return { items: await this.admin.securityEvents(userId ? new UuidPipe().transform(userId) : undefined) };
  }

  @Get('audit-log')
  async auditLog(@Query('entityType') entityType?: string): Promise<{ items: unknown[] }> {
    return { items: await this.admin.auditLog(optionalText(entityType)) };
  }

  @Get('deletion-requests')
  async deletionRequests(): Promise<{ items: unknown[] }> {
    return { items: await this.admin.deletionRequests() };
  }

  @Post('deletion-requests/:id/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async completeDeletion(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<void> {
    await this.admin.completeDeletion(auth, id);
  }
}

import { type CourierJob, type LedgerEntryView, type LocationBatch, locationBatchSchema, type SettlementView } from '@flower-man/contracts';
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { type AuthenticatedContext, AuthGuard, CurrentAuth } from '../auth/auth.guard.js';
import { UuidPipe } from '../common/uuid-param.pipe.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { PartnersService } from '../partners/partners.service.js';
import { DeliveryService } from './delivery.service.js';

/** Couriers. Every action requires an APPROVED courier account and applies only to their own jobs. */
@Controller('courier')
@UseGuards(AuthGuard)
export class CourierController {
  constructor(
    private readonly partners: PartnersService,
    private readonly delivery: DeliveryService,
    private readonly ledger: LedgerService,
  ) {}

  @Get('jobs/offered')
  async offered(@CurrentAuth() auth: AuthenticatedContext): Promise<{ items: CourierJob[] }> {
    return { items: await this.delivery.offeredJobs(await this.partners.requireCourier(auth.userId)) };
  }

  @Get('jobs')
  async mine(@CurrentAuth() auth: AuthenticatedContext): Promise<{ items: CourierJob[] }> {
    return { items: await this.delivery.myJobs(await this.partners.requireCourier(auth.userId)) };
  }

  @Get('deliveries/:id')
  async job(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<CourierJob> {
    return this.delivery.job(await this.partners.requireCourier(auth.userId), id);
  }

  @Post('deliveries/:id/accept')
  @HttpCode(HttpStatus.OK)
  async accept(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<CourierJob> {
    return this.delivery.accept(await this.partners.requireCourier(auth.userId), id);
  }

  @Post('deliveries/:id/release')
  @HttpCode(HttpStatus.NO_CONTENT)
  async release(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<void> {
    await this.delivery.release(await this.partners.requireCourier(auth.userId), id);
  }

  @Post('deliveries/:id/pickup')
  @HttpCode(HttpStatus.OK)
  async pickUp(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<CourierJob> {
    return this.delivery.pickUp(await this.partners.requireCourier(auth.userId), id);
  }

  @Post('deliveries/:id/start')
  @HttpCode(HttpStatus.OK)
  async start(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<CourierJob> {
    return this.delivery.startTransit(await this.partners.requireCourier(auth.userId), id);
  }

  @Post('deliveries/:id/locations')
  @HttpCode(HttpStatus.OK)
  async locations(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodBodyPipe(locationBatchSchema)) body: LocationBatch,
  ): Promise<{ etaAt: string | null }> {
    return this.delivery.recordLocations(await this.partners.requireCourier(auth.userId), id, body.points);
  }

  @Post('deliveries/:id/arrive')
  @HttpCode(HttpStatus.OK)
  async arrive(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<CourierJob> {
    return this.delivery.arrive(await this.partners.requireCourier(auth.userId), id);
  }

  /** Body = the raw photo bytes (Content-Type image/jpeg|png|webp). Optional X-Latitude / X-Longitude headers. */
  @Post('deliveries/:id/proof')
  async proof(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('id', UuidPipe) id: string,
    @Req() request: Request,
    @Headers('x-latitude') latitude?: string,
    @Headers('x-longitude') longitude?: string,
  ): Promise<{ proofId: string }> {
    const lat = Number(latitude);
    const lng = Number(longitude);
    const hasPoint = latitude !== undefined && longitude !== undefined && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    return this.delivery.uploadProof(await this.partners.requireCourier(auth.userId), id, request.body, hasPoint ? { latitude: lat, longitude: lng } : {});
  }

  @Post('deliveries/:id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<CourierJob> {
    return this.delivery.complete(await this.partners.requireCourier(auth.userId), id);
  }

  @Get('earnings')
  async earnings(@CurrentAuth() auth: AuthenticatedContext): Promise<{ balanceMinor: number; entries: LedgerEntryView[]; settlements: SettlementView[] }> {
    const courier = await this.partners.requireCourier(auth.userId);
    return { ...(await this.ledger.entries(courier.partnerId)), settlements: await this.ledger.settlementsForPartner(courier.partnerId) };
  }
}

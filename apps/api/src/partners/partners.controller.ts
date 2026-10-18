import {
  addStaffSchema,
  courierAvailabilitySchema,
  type PartnerAccount,
  type PartnerApplicationRequest,
  partnerApplicationSchema,
  type UpdatePartnerRequest,
  updatePartnerSchema,
} from '@flower-man/contracts';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';

import { type AuthenticatedContext, AuthGuard, CurrentAuth } from '../auth/auth.guard.js';
import { UuidPipe } from '../common/uuid-param.pipe.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { PartnersService } from './partners.service.js';

/**
 * Onboarding endpoints only require sign-in, never an approved capability:
 * an unapproved partner must always be able to complete verification.
 */
@Controller('partner')
@UseGuards(AuthGuard)
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get('accounts')
  async mine(@CurrentAuth() auth: AuthenticatedContext): Promise<{ items: PartnerAccount[] }> {
    return { items: await this.partners.listMine(auth.userId) };
  }

  @Post('accounts')
  async apply(
    @CurrentAuth() auth: AuthenticatedContext,
    @Body(new ZodBodyPipe(partnerApplicationSchema)) body: PartnerApplicationRequest,
  ): Promise<PartnerAccount> {
    return this.partners.apply(auth.userId, body);
  }

  @Get('accounts/:id')
  async get(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<PartnerAccount> {
    return this.partners.getForMember(auth.userId, id);
  }

  @Patch('accounts/:id')
  async update(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodBodyPipe(updatePartnerSchema)) body: UpdatePartnerRequest,
  ): Promise<PartnerAccount> {
    return this.partners.update(auth.userId, id, body);
  }

  @Post('accounts/:id/submit')
  @HttpCode(HttpStatus.OK)
  async submit(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<PartnerAccount> {
    return this.partners.submit(auth.userId, id);
  }

  @Post('accounts/:id/staff')
  @HttpCode(HttpStatus.NO_CONTENT)
  async addStaff(
    @CurrentAuth() auth: AuthenticatedContext,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodBodyPipe(addStaffSchema)) body: { email: string },
  ): Promise<void> {
    await this.partners.addStaff(auth.userId, id, body.email);
  }

  @Post('courier/availability')
  @HttpCode(HttpStatus.NO_CONTENT)
  async availability(
    @CurrentAuth() auth: AuthenticatedContext,
    @Body(new ZodBodyPipe(courierAvailabilitySchema)) body: { available: boolean },
  ): Promise<void> {
    await this.partners.setCourierAvailability(auth.userId, body.available);
  }
}

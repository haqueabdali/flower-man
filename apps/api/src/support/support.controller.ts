import { type CreateTicketRequest, createTicketSchema, type SupportTicket, supportMessageSchema } from '@flower-man/contracts';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';

import { type AuthenticatedContext, AuthGuard, CurrentAuth } from '../auth/auth.guard.js';
import { UuidPipe } from '../common/uuid-param.pipe.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { SupportService } from './support.service.js';

/** Help & support for every signed-in user (customers and partners alike). */
@Controller('support/tickets')
@UseGuards(AuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthenticatedContext): Promise<{ items: SupportTicket[] }> {
    return { items: await this.support.listForUser(auth.userId) };
  }

  @Post()
  async create(@CurrentAuth() auth: AuthenticatedContext, @Body(new ZodBodyPipe(createTicketSchema)) body: CreateTicketRequest): Promise<SupportTicket> {
    return this.support.create(auth.userId, body);
  }

  @Get(':id')
  async get(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<SupportTicket> {
    return this.support.getForUser(auth.userId, id);
  }

  @Post(':id/messages')
  async reply(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string, @Body(new ZodBodyPipe(supportMessageSchema)) body: { body: string }): Promise<SupportTicket> {
    return this.support.userReply(auth.userId, id, body.body);
  }
}

import { type NotificationItem, type PushTokenRequest, pushTokenSchema } from '@flower-man/contracts';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { type AuthenticatedContext, AuthGuard, CurrentAuth } from '../auth/auth.guard.js';
import { UuidPipe } from '../common/uuid-param.pipe.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { NotificationsService } from './notifications.service.js';

@Controller('me')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('push-tokens')
  @HttpCode(HttpStatus.NO_CONTENT)
  async register(@CurrentAuth() auth: AuthenticatedContext, @Body(new ZodBodyPipe(pushTokenSchema)) body: PushTokenRequest): Promise<void> {
    await this.notifications.registerToken(auth.userId, body);
  }

  @Post('push-tokens/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentAuth() auth: AuthenticatedContext,
    @Body(new ZodBodyPipe(z.strictObject({ token: z.string().max(300) }))) body: { token: string },
  ): Promise<void> {
    await this.notifications.removeToken(auth.userId, body.token);
  }

  @Get('notifications')
  async list(@CurrentAuth() auth: AuthenticatedContext): Promise<{ items: NotificationItem[] }> {
    return { items: await this.notifications.list(auth.userId) };
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(@CurrentAuth() auth: AuthenticatedContext, @Param('id', UuidPipe) id: string): Promise<void> {
    await this.notifications.markRead(auth.userId, id);
  }
}


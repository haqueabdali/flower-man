import {
  type ConfirmEmailRequest,
  confirmEmailRequestSchema,
  type PasswordResetConfirm,
  passwordResetConfirmSchema,
  type PasswordResetRequest,
  passwordResetRequestSchema,
} from '@flower-man/contracts';
import { Body, Controller, HttpCode, HttpException, HttpStatus, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import type { AppConfig, RateLimit } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { AccountService } from './account.service.js';
import { type AuthenticatedContext, AuthGuard, CurrentAuth } from './auth.guard.js';
import { RATE_LIMITER_FACTORY, type RateLimiter, type RateLimiterFactory } from './rate-limiter.js';
import { requestMeta } from './request-meta.js';

@Controller('auth')
export class AccountController {
  private readonly resetPerIp: RateLimiter;
  private readonly resetPerAccount: RateLimiter;
  private readonly verificationPerUser: RateLimiter;

  constructor(
    private readonly account: AccountService,
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(RATE_LIMITER_FACTORY) createLimiter: RateLimiterFactory,
  ) {
    const limits = config.auth.rateLimits;
    const limiter = (name: string, { limit, windowMs }: RateLimit): RateLimiter =>
      createLimiter(name, limit, windowMs);
    this.resetPerIp = limiter('password-reset-ip', limits.passwordResetPerIp);
    this.resetPerAccount = limiter('password-reset-account', limits.passwordResetPerAccount);
    this.verificationPerUser = limiter('verification-email-user', limits.verificationEmailPerUser);
  }

  /** Sends (again) the verification email to the signed-in user. 204 also when already verified. */
  @Post('email-verification/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  async requestVerification(
    @CurrentAuth() auth: AuthenticatedContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.limit(response, this.verificationPerUser, `user:${auth.userId}`);
    await this.account.sendVerificationEmail(auth.userId, requestMeta(request));
  }

  @Post('email-verification/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmEmail(
    @Body(new ZodBodyPipe(confirmEmailRequestSchema)) body: ConfirmEmailRequest,
    @Req() request: Request,
  ): Promise<void> {
    await this.account.confirmEmail(body.token, requestMeta(request));
  }

  /** 202 whether or not the account exists. */
  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(
    @Body(new ZodBodyPipe(passwordResetRequestSchema)) body: PasswordResetRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const meta = requestMeta(request);
    await this.limit(response, this.resetPerIp, `ip:${meta.ip}`);
    await this.limit(response, this.resetPerAccount, `account:${body.email.trim().toLowerCase()}`);
    await this.account.requestPasswordReset(body.email, meta);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmPasswordReset(
    @Body(new ZodBodyPipe(passwordResetConfirmSchema)) body: PasswordResetConfirm,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const meta = requestMeta(request);
    await this.limit(response, this.resetPerIp, `ip:${meta.ip}`);
    await this.account.confirmPasswordReset(body.token, body.newPassword, meta);
  }

  private async limit(response: Response, rateLimiter: RateLimiter, key: string): Promise<void> {
    const result = await rateLimiter.consume(key);
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new HttpException('Too many attempts. Please wait and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

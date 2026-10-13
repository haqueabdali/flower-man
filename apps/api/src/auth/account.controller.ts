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
import { RateLimiter } from './rate-limiter.js';
import { requestMeta } from './request-meta.js';

const limiter = ({ limit, windowMs }: RateLimit): RateLimiter => new RateLimiter(limit, windowMs);

@Controller('auth')
export class AccountController {
  private readonly resetPerIp: RateLimiter;
  private readonly resetPerAccount: RateLimiter;
  private readonly verificationPerUser: RateLimiter;

  constructor(
    private readonly account: AccountService,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    const limits = config.auth.rateLimits;
    this.resetPerIp = limiter(limits.passwordResetPerIp);
    this.resetPerAccount = limiter(limits.passwordResetPerAccount);
    this.verificationPerUser = limiter(limits.verificationEmailPerUser);
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
    this.limit(response, this.verificationPerUser, `user:${auth.userId}`);
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
    this.limit(response, this.resetPerIp, `ip:${meta.ip}`);
    this.limit(response, this.resetPerAccount, `account:${body.email.trim().toLowerCase()}`);
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
    this.limit(response, this.resetPerIp, `ip:${meta.ip}`);
    await this.account.confirmPasswordReset(body.token, body.newPassword, meta);
  }

  private limit(response: Response, rateLimiter: RateLimiter, key: string): void {
    const result = rateLimiter.consume(key);
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new HttpException('Too many attempts. Please wait and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

import {
  type AuthTokensResponse,
  type LoginRequest,
  loginRequestSchema,
  type MeResponse,
  type RefreshRequest,
  refreshRequestSchema,
  type RegisterRequest,
  registerRequestSchema,
} from '@flower-man/contracts';
import { Body, Controller, Get, Header, HttpCode, HttpException, HttpStatus, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import type { AppConfig, RateLimit } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { type AuthenticatedContext, AuthGuard, CurrentAuth } from './auth.guard.js';
import { AccountService } from './account.service.js';
import { AuthService } from './auth.service.js';
import { RATE_LIMITER_FACTORY, type RateLimiter, type RateLimiterFactory } from './rate-limiter.js';
import { requestMeta } from './request-meta.js';

@Controller('auth')
export class AuthController {
  // Per process or shared in PostgreSQL (RATE_LIMIT_STORE, ADR-015). Keys never contain passwords; emails are lower-cased.
  private readonly loginPerAccount: RateLimiter;
  private readonly loginPerIp: RateLimiter;
  private readonly registerPerIp: RateLimiter;
  private readonly refreshPerIp: RateLimiter;

  constructor(
    private readonly auth: AuthService,
    private readonly account: AccountService,
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(RATE_LIMITER_FACTORY) createLimiter: RateLimiterFactory,
  ) {
    const limits = config.auth.rateLimits;
    const limiter = (name: string, { limit, windowMs }: RateLimit): RateLimiter =>
      createLimiter(name, limit, windowMs);
    this.loginPerAccount = limiter('login-account', limits.loginPerAccount);
    this.loginPerIp = limiter('login-ip', limits.loginPerIp);
    this.registerPerIp = limiter('register-ip', limits.registerPerIp);
    this.refreshPerIp = limiter('refresh-ip', limits.refreshPerIp);
  }

  @Post('register')
  @Header('Cache-Control', 'no-store')
  async register(
    @Body(new ZodBodyPipe(registerRequestSchema)) body: RegisterRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokensResponse> {
    const meta = requestMeta(request);
    await this.limit(response, this.registerPerIp, `ip:${meta.ip}`);
    const tokens = await this.auth.register(body, meta);
    // The account exists even if the email cannot be sent; the user can ask for it again.
    await this.account.sendVerificationEmail(tokens.user.id, meta).catch(() => undefined);
    return tokens;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body(new ZodBodyPipe(loginRequestSchema)) body: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokensResponse> {
    const meta = requestMeta(request);
    await this.limit(response, this.loginPerIp, `ip:${meta.ip}`);
    await this.limit(response, this.loginPerAccount, `account:${body.email.trim().toLowerCase()}`);
    return this.auth.login(body, meta);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async refresh(
    @Body(new ZodBodyPipe(refreshRequestSchema)) body: RefreshRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthTokensResponse> {
    const meta = requestMeta(request);
    await this.limit(response, this.refreshPerIp, `ip:${meta.ip}`);
    return this.auth.refresh(body.refreshToken, meta);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard)
  async logout(@CurrentAuth() auth: AuthenticatedContext, @Req() request: Request): Promise<void> {
    await this.auth.logout(auth, requestMeta(request));
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthGuard)
  me(@CurrentAuth() auth: AuthenticatedContext): MeResponse {
    return { user: auth.user };
  }

  private async limit(response: Response, limiter: RateLimiter, key: string): Promise<void> {
    const result = await limiter.consume(key);
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new HttpException('Too many attempts. Please wait and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}

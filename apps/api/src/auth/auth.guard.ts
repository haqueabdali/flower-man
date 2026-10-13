import type { AuthUser, Capability } from '@flower-man/contracts';
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import pg from 'pg';

import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { PG_POOL } from '../database/database.module.js';
import type { AuthContext } from './auth.service.js';
import { loadSessionUser, toAuthUser } from './auth-users.js';
import { verifyAccessToken } from './tokens.js';

export interface AuthenticatedContext extends AuthContext {
  readonly user: AuthUser;
}

type AuthenticatedRequest = Request & { auth?: AuthenticatedContext };

const CAPABILITIES_KEY = 'flower-man:required-capabilities';

/** The route requires at least ONE of the listed capabilities (checked after authentication). */
export const RequireCapabilities = (...capabilities: Capability[]) => SetMetadata(CAPABILITIES_KEY, capabilities);

/** Injects the authenticated context set by AuthGuard. */
export const CurrentAuth = createParamDecorator((_data: unknown, context: ExecutionContext): AuthenticatedContext => {
  const auth = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
  if (!auth) {
    throw new UnauthorizedException();
  }
  return auth;
});

/**
 * Verifies the bearer access token, then checks on EVERY request that the session is still active
 * and the account is ACTIVE, so logout, suspension and session revocation take effect immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.header('authorization') ?? '';
    const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header);
    if (!match?.[1]) {
      throw new UnauthorizedException('Sign in required.');
    }

    const claims = await verifyAccessToken(match[1], this.config.auth.accessTokenSecret);
    if (!claims) {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    const row = await loadSessionUser(this.pool, claims.sessionId, claims.userId);
    if (!row || row.revoked_at !== null || row.expires_at <= new Date() || row.status !== 'ACTIVE') {
      throw new UnauthorizedException('Session is no longer valid. Please sign in again.');
    }
    const user = toAuthUser(row);

    const required = this.reflector.getAllAndOverride<Capability[] | undefined>(CAPABILITIES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0 && !required.some((capability) => user.capabilities.includes(capability))) {
      throw new ForbiddenException('You do not have permission to do this.');
    }

    request.auth = { userId: claims.userId, sessionId: claims.sessionId, user };
    return true;
  }
}

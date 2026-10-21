import { deletionRequestSchema, type PreferencesRequest, preferencesSchema } from '@flower-man/contracts';
import { Body, ConflictException, Controller, HttpCode, HttpStatus, Inject, Post, Put, UseGuards } from '@nestjs/common';
import pg from 'pg';

import { type AuthenticatedContext, AuthGuard, CurrentAuth } from '../auth/auth.guard.js';
import { ZodBodyPipe } from '../common/zod-body.pipe.js';
import { PG_POOL } from '../database/database.module.js';
import { DataExportService } from './data-export.service.js';

@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    private readonly exports: DataExportService,
  ) {}

  /** Privacy: emails a JSON copy of the user's personal data to their own verified address (once per hour). */
  @Post('data-export')
  @HttpCode(HttpStatus.ACCEPTED)
  async dataExport(@CurrentAuth() auth: AuthenticatedContext): Promise<{ status: 'SENT' }> {
    await this.exports.emailExport(auth.userId);
    return { status: 'SENT' };
  }

  /** Privacy: asks for the account and its personal data to be deleted (processed by an administrator). */
  @Post('deletion-request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestDeletion(@CurrentAuth() auth: AuthenticatedContext, @Body(new ZodBodyPipe(deletionRequestSchema)) body: { reason?: string }): Promise<{ status: 'PENDING' }> {
    try {
      await this.pool.query('INSERT INTO account_deletion_requests (user_id, reason) VALUES ($1, $2)', [auth.userId, body.reason ?? null]);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('A deletion request is already pending.');
      }
      throw error;
    }
    return { status: 'PENDING' };
  }

  /** The apps send the device language at sign-in; notifications are then written in it. */
  @Put('preferences')
  @HttpCode(HttpStatus.NO_CONTENT)
  async preferences(@CurrentAuth() auth: AuthenticatedContext, @Body(new ZodBodyPipe(preferencesSchema)) body: PreferencesRequest): Promise<void> {
    await this.pool.query('UPDATE users SET language = $2, updated_at = now() WHERE id = $1', [auth.userId, body.language]);
  }
}

import { Module } from '@nestjs/common';

import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';

@Module({
  controllers: [AuthController, AccountController],
  providers: [AuthService, AccountService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}

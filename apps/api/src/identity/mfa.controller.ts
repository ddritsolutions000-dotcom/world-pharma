import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from './current-principal';
import { JwtAuthGuard } from './jwt.guard';
import { MfaService } from './mfa.service';

@Controller()
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @Get('auth/mfa/status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentPrincipal() principal: Principal) {
    return this.mfa.statusForPerson(principal.personId);
  }

  @Post('auth/mfa/enroll/start')
  @HttpCode(200)
  enrollStart(@Body() body: { mfa_token?: string }, @Req() req: Request) {
    if (!body.mfa_token) {
      throw Errors.validation('mfa_token is required');
    }
    return this.mfa.startEnrollment(body.mfa_token, req.header('x-request-id'));
  }

  @Post('auth/mfa/enroll/confirm')
  @HttpCode(200)
  enrollConfirm(@Body() body: { mfa_token?: string; code?: string }, @Req() req: Request) {
    if (!body.mfa_token || !body.code) {
      throw Errors.validation('mfa_token and code are required');
    }
    return this.mfa.confirmEnrollment(body.mfa_token, body.code, req.header('x-request-id'));
  }

  @Post('auth/mfa/recovery/regenerate')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  regenerateRecovery(@CurrentPrincipal() principal: Principal, @Req() req: Request) {
    return this.mfa.regenerateRecoveryCodes(principal.personId, principal.personId, req.header('x-request-id'));
  }
}

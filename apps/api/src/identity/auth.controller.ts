import { Body, Controller, Get, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAudience } from '@prisma/client';
import { z } from 'zod';
import type { Request } from 'express';
import { Errors } from '../common/problem';
import { AuthService } from './auth.service';
import { CurrentPrincipal, type Principal } from './current-principal';
import { JwtAuthGuard } from './jwt.guard';

const otpRequestSchema = z
  .object({
  identifier: z.string().min(3).max(320),
  purpose: z
    .enum(['REGISTER', 'LOGIN', 'VERIFY_EMAIL', 'VERIFY_PHONE', 'ACCOUNT_RECOVERY', 'STEP_UP'])
    .optional(),
  channel: z.enum(['SMS', 'EMAIL']).optional(),
    country_code: z.string().length(2).optional(),
  })
  .strict();

const otpVerifySchema = z.object({
  challenge_id: z.string().uuid(),
  code: z.string().min(4).max(8),
    audience: z.enum(['customer', 'partner_applicant', 'admin', 'doctor']).optional(),
  })
  .strict();

const refreshSchema = z
  .object({
    refresh_token: z.string().min(16),
  })
  .strict();

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('auth/otp/request')
  @HttpCode(200)
  async requestOtp(@Body() body: unknown, @Req() req: Request) {
    const parsed = otpRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('identifier is required');
    }
    const result = await this.auth.requestOtp({
      identifier: parsed.data.identifier,
      purpose: parsed.data.purpose,
      channel: parsed.data.channel,
      countryCode: parsed.data.country_code,
      ip: req.ip,
      requestId: req.header('x-request-id'),
    });
    return {
      challenge_id: result.challengeId,
      expires_at: result.expiresAt,
      resend_available_at: result.resendAvailableAt,
      ...(result.devCode ? { dev_code: result.devCode } : {}),
    };
  }

  @Post('auth/otp/verify')
  @HttpCode(200)
  async verifyOtp(@Body() body: unknown, @Req() req: Request) {
    const parsed = otpVerifySchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('challenge_id and code are required');
    }
    const tokens = await this.auth.verifyOtp({
      challengeId: parsed.data.challenge_id,
      code: parsed.data.code,
      audience: parsed.data.audience,
      ip: req.ip,
      userAgent: req.header('user-agent'),
      requestId: req.header('x-request-id'),
    });
    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: tokens.expiresIn,
      token_type: tokens.tokenType,
      person_id: tokens.personId,
      session_id: tokens.sessionId,
    };
  }

  @Post('auth/token/refresh')
  @HttpCode(200)
  async refresh(@Body() body: unknown, @Req() req: Request) {
    const parsed = refreshSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('refresh_token is required');
    }
    const tokens = await this.auth.refresh(
      parsed.data.refresh_token,
      req.ip,
      req.header('x-request-id'),
    );
    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_in: tokens.expiresIn,
      token_type: 'Bearer',
      session_id: tokens.sessionId,
    };
  }

  @Post('auth/logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentPrincipal() principal: Principal, @Req() req: Request) {
    await this.auth.logout(principal.sessionId, principal.personId, req.header('x-request-id'));
    return { ok: true };
  }

  @Post('auth/logout-all')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentPrincipal() principal: Principal, @Req() req: Request) {
    await this.auth.logoutAll(principal.personId, req.header('x-request-id'));
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentPrincipal() principal: Principal) {
    return this.auth.me(principal.personId);
  }

  @Get('auth/me')
  @UseGuards(JwtAuthGuard)
  meAlias(@CurrentPrincipal() principal: Principal) {
    return this.auth.me(principal.personId);
  }

  @Patch('me/profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { preferred_locale?: string; primary_country_id?: string | null },
  ) {
    return this.auth.updateProfile(principal.personId, body);
  }
}

export type { JwtAudience };

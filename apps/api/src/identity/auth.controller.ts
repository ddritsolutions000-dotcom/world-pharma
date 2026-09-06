import { Body, Controller, Get, HttpCode, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAudience } from '@prisma/client';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { AppEnv } from '@world-pharma/config';
import { Errors } from '../common/problem';
import {
  clearAuthCookies,
  parseCookieHeader,
  readRefreshTokenFromRequest,
  setAuthCookies,
} from './auth-cookies';
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

const otpVerifySchema = z
  .object({
    challenge_id: z.string().uuid(),
    code: z.string().min(4).max(8),
    audience: z.enum(['customer', 'partner_applicant', 'admin', 'doctor']).optional(),
  })
  .strict();

const refreshSchema = z
  .object({
    refresh_token: z.string().min(16).optional(),
  })
  .strict();

const mfaVerifyLoginSchema = z
  .object({
    mfa_token: z.string().min(16),
    code: z.string().min(6).max(16),
  })
  .strict();

const passwordLoginSchema = z
  .object({
    identifier: z.string().min(3).max(320),
    password: z.string().min(8).max(128),
    country_code: z.string().length(2).optional(),
  })
  .strict();

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  private cookieEnv() {
    return { NODE_ENV: this.config.get('NODE_ENV', { infer: true }) };
  }

  private applySessionCookies(res: Response, tokens: { accessToken: string; refreshToken: string; expiresIn: number }) {
    const refreshTtl = this.config.get('AUTH_REFRESH_TTL_SECONDS', { infer: true });
    setAuthCookies(
      res,
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessTtl: tokens.expiresIn,
        refreshTtl,
      },
      this.cookieEnv(),
    );
  }

  /** Partner: User ID + password → OTP on registered mobile (then `auth/otp/verify`). */
  @Post('auth/password/login')
  @HttpCode(200)
  async passwordLogin(@Body() body: unknown, @Req() req: Request) {
    const parsed = passwordLoginSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('identifier and password are required');
    }
    const result = await this.auth.beginPasswordLogin({
      identifier: parsed.data.identifier,
      password: parsed.data.password,
      countryCode: parsed.data.country_code,
      ip: req.ip,
      requestId: req.header('x-request-id'),
    });
    return {
      next: result.next,
      challenge_id: result.challengeId,
      expires_at: result.expiresAt,
      resend_available_at: result.resendAvailableAt,
      masked_phone: result.maskedPhone,
      channel: result.channel,
      ...(result.devCode ? { dev_code: result.devCode } : {}),
    };
  }

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
  async verifyOtp(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const parsed = otpVerifySchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('challenge_id and code are required');
    }
    const result = await this.auth.verifyOtp({
      challengeId: parsed.data.challenge_id,
      code: parsed.data.code,
      audience: parsed.data.audience,
      ip: req.ip,
      userAgent: req.header('user-agent'),
      requestId: req.header('x-request-id'),
    });
    if (result.kind === 'mfa') {
      return {
        mfa_required: true,
        mfa_enrollment_required: result.mfaEnrollmentRequired,
        mfa_token: result.mfaToken,
        person_id: result.personId,
        ...(result.devTotpCode ? { dev_totp_code: result.devTotpCode } : {}),
      };
    }
    this.applySessionCookies(res, result);
    return {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      expires_in: result.expiresIn,
      token_type: result.tokenType,
      person_id: result.personId,
      session_id: result.sessionId,
    };
  }

  @Post('auth/mfa/verify-login')
  @HttpCode(200)
  async verifyMfaLogin(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const parsed = mfaVerifyLoginSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('mfa_token and code are required');
    }
    const tokens = await this.auth.completeLoginAfterMfa({
      mfaToken: parsed.data.mfa_token,
      code: parsed.data.code,
      ip: req.ip,
      userAgent: req.header('user-agent'),
      requestId: req.header('x-request-id'),
    });
    this.applySessionCookies(res, tokens);
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
  async refresh(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const parsed = refreshSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw Errors.validation('refresh body is invalid');
    }
    const cookies = parseCookieHeader(req.header('cookie'));
    const refreshToken = readRefreshTokenFromRequest(cookies, parsed.data.refresh_token);
    if (!refreshToken) {
      throw Errors.refreshInvalid();
    }
    const tokens = await this.auth.refresh(refreshToken, req.ip, req.header('x-request-id'));
    this.applySessionCookies(res, tokens);
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
  async logout(
    @CurrentPrincipal() principal: Principal,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(principal.sessionId, principal.personId, req.header('x-request-id'));
    clearAuthCookies(res, this.cookieEnv());
    return { ok: true };
  }

  @Post('auth/logout-all')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @CurrentPrincipal() principal: Principal,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logoutAll(principal.personId, req.header('x-request-id'));
    clearAuthCookies(res, this.cookieEnv());
    return { ok: true };
  }

  @Get('auth/bootstrap')
  @UseGuards(JwtAuthGuard)
  bootstrap(@CurrentPrincipal() principal: Principal) {
    return this.auth.bootstrap(principal.personId, principal.sessionId);
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

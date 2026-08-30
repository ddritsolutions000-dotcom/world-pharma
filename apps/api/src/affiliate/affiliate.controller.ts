import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { AffiliateService } from './affiliate.service';

@Controller('admin/affiliate')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminAffiliateController {
  constructor(private readonly affiliates: AffiliateService) {}

  @Get('partners')
  @RequirePermissions('affiliate:read')
  listPartners(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
  ) {
    return this.affiliates.listPartners(principal, countryCode ?? '');
  }

  @Post('referral-codes')
  @RequirePermissions('affiliate:manage')
  createReferralCode(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      organization_id?: string;
      code?: string;
      partner_id?: string | null;
      expires_at?: string | null;
    },
    @Headers('idempotency-key') _idempotencyHeader?: string,
  ) {
    return this.affiliates.adminCreateReferralCode(principal, {
      country_code: body.country_code ?? '',
      organization_id: body.organization_id ?? '',
      code: body.code ?? '',
      partner_id: body.partner_id,
      expires_at: body.expires_at,
    });
  }
}

@Controller('me/affiliate')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class AffiliateSelfController {
  constructor(private readonly affiliates: AffiliateService) {}

  @Get('earnings')
  earnings(@CurrentPrincipal() principal: Principal) {
    return this.affiliates.listEarnings(principal);
  }

  @Get('codes')
  listCodes(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    return this.affiliates.listReferralCodes(principal, countryCode);
  }

  @Post('codes')
  createCode(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { country_code?: string; code?: string; expires_at?: string | null },
    @Headers('idempotency-key') _idempotencyHeader?: string,
  ) {
    return this.affiliates.createSelfReferralCode(principal, {
      country_code: body.country_code,
      code: body.code ?? '',
      expires_at: body.expires_at,
    });
  }

  @Patch('codes/:id')
  updateCode(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { country_code?: string; status?: string; version: number },
  ) {
    return this.affiliates.updateReferralCode(principal, id, body);
  }

  @Get('links')
  listLinks(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    return this.affiliates.listLinks(principal, countryCode);
  }

  @Post('links')
  createLink(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      referral_code_id?: string;
      label?: string | null;
      landing_path?: string | null;
    },
    @Headers('idempotency-key') _idempotencyHeader?: string,
  ) {
    return this.affiliates.createLink(principal, {
      country_code: body.country_code,
      referral_code_id: body.referral_code_id ?? '',
      label: body.label,
      landing_path: body.landing_path,
    });
  }

  @Get('stats')
  stats(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    return this.affiliates.stats(principal, countryCode);
  }
}

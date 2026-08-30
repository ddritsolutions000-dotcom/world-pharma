import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { PromoCampaignService } from './promo-campaign.service';

@Controller('admin/promo/campaigns')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
export class AdminPromoController {
  constructor(private readonly promos: PromoCampaignService) {}

  @Get()
  @RequireAudiences('admin')
  @RequirePermissions('promo:read')
  list(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    return this.promos.list(principal, countryCode ?? '');
  }

  @Get(':id')
  @RequireAudiences('admin')
  @RequirePermissions('promo:read')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.promos.get(principal, id, countryCode ?? '');
  }

  @Post()
  @RequireAudiences('admin')
  @RequirePermissions('promo:manage')
  create(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      code?: string;
      kind?: string;
      percent_bps?: number;
      fixed_minor?: string;
      min_basket_minor?: string;
      funding?: string;
      max_redemptions?: number | null;
      expires_at?: string | null;
    },
    @Headers('idempotency-key') _idempotencyHeader?: string,
  ) {
    return this.promos.create(principal, {
      country_code: body.country_code ?? '',
      code: body.code ?? '',
      kind: body.kind ?? 'PERCENT',
      percent_bps: body.percent_bps,
      fixed_minor: body.fixed_minor,
      min_basket_minor: body.min_basket_minor,
      funding: body.funding,
      max_redemptions: body.max_redemptions,
      expires_at: body.expires_at,
    });
  }

  @Patch(':id')
  @RequireAudiences('admin')
  @RequirePermissions('promo:manage')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: {
      country_code?: string;
      kind?: string;
      percent_bps?: number;
      fixed_minor?: string;
      min_basket_minor?: string;
      funding?: string;
      max_redemptions?: number | null;
      expires_at?: string | null;
      status?: string;
      version?: number;
    },
    @Headers('idempotency-key') _idempotencyHeader?: string,
  ) {
    return this.promos.update(principal, id, {
      country_code: body.country_code ?? '',
      kind: body.kind,
      percent_bps: body.percent_bps,
      fixed_minor: body.fixed_minor,
      min_basket_minor: body.min_basket_minor,
      funding: body.funding,
      max_redemptions: body.max_redemptions,
      expires_at: body.expires_at,
      status: body.status,
      version: body.version,
    });
  }

  @Get(':id/redemptions')
  @RequireAudiences('admin')
  @RequirePermissions('promo:read')
  listRedemptions(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.promos.listRedemptions(principal, id, countryCode ?? '');
  }
}

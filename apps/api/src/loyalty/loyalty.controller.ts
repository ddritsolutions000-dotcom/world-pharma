import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { LoyaltyService } from './loyalty.service';

@Controller('me/loyalty')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class LoyaltySelfController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('balance')
  balance(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    return this.loyalty.getBalance(principal, countryCode ?? '');
  }

  @Get('ledger')
  ledger(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    return this.loyalty.listLedger(principal, countryCode ?? '');
  }
}

@Controller('admin/loyalty')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminLoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('programs')
  @RequirePermissions('loyalty:read')
  list(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    return this.loyalty.listPrograms(principal, countryCode ?? '');
  }

  @Post('programs')
  @RequirePermissions('loyalty:manage')
  create(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      country_code?: string;
      code?: string;
      name?: string;
      points_per_currency_minor?: number;
    },
  ) {
    return this.loyalty.createProgram(principal, {
      country_code: body.country_code ?? '',
      code: body.code ?? '',
      name: body.name ?? '',
      points_per_currency_minor: body.points_per_currency_minor,
    });
  }

  @Patch('programs/:id')
  @RequirePermissions('loyalty:manage')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('country_code') countryCode: string,
    @Body() body: { status?: string; name?: string; version: number },
  ) {
    return this.loyalty.updateProgram(principal, id, {
      country_code: countryCode ?? '',
      status: body.status,
      name: body.name,
      version: body.version,
    });
  }
}

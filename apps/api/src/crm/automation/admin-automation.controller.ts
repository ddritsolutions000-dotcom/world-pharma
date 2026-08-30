import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../../identity/current-principal';
import { JwtAuthGuard } from '../../identity/jwt.guard';
import { AudienceGuard } from '../../identity/audience.guard';
import { RequireAudiences } from '../../identity/require-audiences';
import { PermissionsGuard } from '../../identity/permissions.guard';
import { RequirePermissions } from '../../identity/require-permissions';
import { RefillMarketingService } from './refill-marketing.service';

@Controller('admin/crm')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
export class AdminAutomationController {
  constructor(private readonly refillMarketing: RefillMarketingService) {}

  @Get('automation-runs')
  @RequireAudiences('admin')
  @RequirePermissions('crm:read')
  listRuns(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('person_id') personId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.refillMarketing.listRuns(principal, {
      country_code: countryCode ?? '',
      person_id: personId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('automation/evaluate')
  @RequireAudiences('admin')
  @RequirePermissions('crm:write')
  evaluate(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { country_code?: string },
  ) {
    return this.refillMarketing.evaluateCountry(principal, body.country_code ?? '');
  }
}

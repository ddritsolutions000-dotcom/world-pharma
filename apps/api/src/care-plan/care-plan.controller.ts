import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CarePlanCatalogStatus } from '@prisma/client';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { CarePlanDefinitionService } from './care-plan-definition.service';
import { CarePlanService } from './care-plan.service';

@Controller('public/care-plans')
export class PublicCarePlanController {
  constructor(private readonly carePlans: CarePlanService) {}

  @Get()
  list(@Query('country_code') countryCode?: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.carePlans.listCatalog(countryCode);
  }
}

@Controller('me/care-plan')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class CarePlanSelfController {
  constructor(private readonly carePlans: CarePlanService) {}

  @Get()
  mine(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.carePlans.getMine(principal, countryCode);
  }

  @Post('subscribe')
  subscribe(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { country_code?: string; plan_code?: string },
  ) {
    if (!body.country_code?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.carePlans.subscribe(principal, body.country_code, body.plan_code ?? '');
  }

  @Post('cancel')
  cancel(@CurrentPrincipal() principal: Principal, @Body() body: { country_code?: string }) {
    if (!body.country_code?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.carePlans.cancel(principal, body.country_code);
  }
}

@Controller('admin/care-plan')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminCarePlanController {
  constructor(
    private readonly carePlans: CarePlanService,
    private readonly definitions: CarePlanDefinitionService,
  ) {}

  @Get('catalog')
  @RequirePermissions('loyalty:read')
  catalog(@Query('country_code') countryCode?: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.definitions.listAdmin(countryCode);
  }

  @Post('catalog')
  @HttpCode(200)
  @RequirePermissions('loyalty:manage')
  createCatalog(
    @Query('country_code') countryCode: string | undefined,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.definitions.create(principal.personId, countryCode, body);
  }

  @Patch('catalog/:planCode')
  @RequirePermissions('loyalty:manage')
  updateCatalog(
    @Query('country_code') countryCode: string | undefined,
    @Param('planCode') planCode: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.definitions.update(principal.personId, countryCode, planCode, body);
  }

  @Post('catalog/:planCode/status')
  @HttpCode(200)
  @RequirePermissions('loyalty:manage')
  setCatalogStatus(
    @Query('country_code') countryCode: string | undefined,
    @Param('planCode') planCode: string,
    @Body() body: { status?: CarePlanCatalogStatus },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    if (!body.status) {
      throw Errors.validation('status is required');
    }
    return this.definitions.setStatus(principal.personId, countryCode, planCode, body.status);
  }

  @Get('memberships')
  @RequirePermissions('loyalty:read')
  summary(@Query('country_code') countryCode?: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.carePlans.adminSummary(countryCode);
  }

  @Post('memberships/:id/cancel')
  @RequirePermissions('loyalty:manage')
  cancelMembership(@Param('id') id: string) {
    return this.carePlans.adminCancel(id);
  }
}

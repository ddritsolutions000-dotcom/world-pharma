import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { HealthPackageStatus } from '@prisma/client';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { HealthPackagesCatalogService } from './health-packages-catalog.service';

@Controller('admin/health-packages')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminHealthPackagesController {
  constructor(private readonly catalog: HealthPackagesCatalogService) {}

  @Get()
  @RequirePermissions('lab:review')
  list(
    @Query('country_code') countryCode?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.catalog.listAdmin(countryCode, { search, status });
  }

  @Get(':code')
  @RequirePermissions('lab:review')
  get(@Query('country_code') countryCode: string | undefined, @Param('code') code: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.catalog.getAdmin(countryCode, code);
  }

  @Post()
  @HttpCode(200)
  @RequirePermissions('lab:review')
  create(
    @Query('country_code') countryCode: string | undefined,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.catalog.create(principal.personId, countryCode, body as never);
  }

  @Patch(':code')
  @RequirePermissions('lab:review')
  update(
    @Query('country_code') countryCode: string | undefined,
    @Param('code') code: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.catalog.update(principal.personId, countryCode, code, body as never);
  }

  @Post(':code/status')
  @HttpCode(200)
  @RequirePermissions('lab:review')
  setStatus(
    @Query('country_code') countryCode: string | undefined,
    @Param('code') code: string,
    @Body() body: { status?: HealthPackageStatus },
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    if (!body.status) {
      throw Errors.validation('status is required');
    }
    return this.catalog.setStatus(principal.personId, countryCode, code, body.status);
  }
}

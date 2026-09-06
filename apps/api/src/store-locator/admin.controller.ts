import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { StoreLocatorService } from './store-locator.service';

@Controller('admin/store-locator')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminStoreLocatorController {
  constructor(private readonly storeLocator: StoreLocatorService) {}

  @Get('locations')
  @RequirePermissions('inventory:read')
  listLocations(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('city') city?: string,
    @Query('pincode') pincode?: string,
    @Query('limit') limit?: string,
  ) {
    return this.storeLocator.searchStoresByLocation(principal, {
      country_code: countryCode,
      city,
      pincode,
      limit: limit ? Number(limit) : undefined,
    });
  }
}

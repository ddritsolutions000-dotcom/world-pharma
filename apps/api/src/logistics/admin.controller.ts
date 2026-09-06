import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import type { MockBookingScenario } from './carrier.port';
import { LogisticsService } from './logistics.service';
import { ServiceabilityZoneService } from './serviceability-zone.service';

@Controller('admin/shipments')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class LogisticsAdminController {
  constructor(
    private readonly logistics: LogisticsService,
    private readonly zones: ServiceabilityZoneService,
  ) {}

  @Get()
  @RequirePermissions('logistics:read')
  search() {
    return this.logistics.adminSearch();
  }

  @Get('serviceability')
  @RequirePermissions('logistics:read')
  serviceability(@Query('country') country?: string, @Query('postal_code') postalCode?: string) {
    if (!country?.trim()) {
      throw Errors.validation('country query parameter is required');
    }
    return this.zones.check(country.trim(), postalCode ?? '');
  }

  @Get('serviceability/zones')
  @RequirePermissions('logistics:read')
  listZones(@Query('country') country?: string) {
    if (!country?.trim()) {
      throw Errors.validation('country query parameter is required');
    }
    return this.zones.list(country.trim());
  }

  @Post('serviceability/zones')
  @HttpCode(200)
  @RequirePermissions('logistics:manage')
  createZone(
    @Query('country') country: string | undefined,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() principal: Principal,
  ) {
    if (!country?.trim()) {
      throw Errors.validation('country query parameter is required');
    }
    return this.zones.create(principal.personId, country.trim(), body);
  }

  @Patch('serviceability/zones/:zoneId')
  @RequirePermissions('logistics:manage')
  updateZone(
    @Param('zoneId') zoneId: string,
    @Body() body: Record<string, unknown>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.zones.update(principal.personId, zoneId, body);
  }

  @Get('carriers')
  @RequirePermissions('logistics:read')
  carriers() {
    return this.logistics.listCarriers();
  }

  @Get('production-availability')
  @RequirePermissions('logistics:read')
  productionAvailability(@Query('country_code') countryCode: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.logistics.evaluateProductionLogisticsAvailable(countryCode);
  }

  @Post('production-availability/assert')
  @RequirePermissions('logistics:manage')
  assertProductionAvailability(@Query('country_code') countryCode: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.logistics.assertProductionLogisticsAvailable(countryCode);
  }

  @Get('exceptions')
  @RequirePermissions('logistics:read')
  exceptions() {
    return this.logistics.adminExceptions();
  }

  @Get('snapshot')
  @RequirePermissions('logistics:read')
  snapshot() {
    return this.logistics.adminSnapshot();
  }

  @Post(':id/book')
  @RequirePermissions('logistics:manage')
  book(
    @Param('id') id: string,
    @Body() body: { scenario?: MockBookingScenario; carrier_code?: string },
  ) {
    return this.logistics.requestBooking(id, body.scenario ?? 'BOOK_SUCCESS', body.carrier_code ?? null);
  }

  @Post(':id/reconcile')
  @RequirePermissions('logistics:reconcile')
  recon(@Param('id') id: string) {
    return this.logistics.reconcile(id);
  }

  @Post(':id/rto')
  @RequirePermissions('logistics:manage')
  rto(@Param('id') id: string) {
    return this.logistics.markRto(id);
  }

  @Post(':id/cancel')
  @RequirePermissions('logistics:manage')
  cancel(@Param('id') id: string) {
    return this.logistics.cancelShipment(id);
  }

  @Post(':id/otp')
  @RequirePermissions('logistics:manage')
  otp(@Param('id') id: string) {
    return this.logistics.ensureOtp(id);
  }

  @Post(':id/otp/verify')
  @RequirePermissions('logistics:manage')
  verify(@Param('id') id: string, @Body() body: { code?: string }) {
    return this.logistics.verifyOtp(id, body.code ?? '');
  }

  @Post(':id/partner-job')
  @RequirePermissions('logistics:read')
  job(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.logistics.partnerJob(principal, id);
  }
}

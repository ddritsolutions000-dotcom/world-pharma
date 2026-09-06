import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { Errors } from '../common/problem';
import { HealthcarePartnerReadinessService } from './healthcare-partner-readiness.service';
import { evaluateProductionHealthcareAvailable } from './production-healthcare-gate';
import { PrismaService } from '../app/prisma.service';
import type { HealthcareProviderKind } from './healthcare-partner-readiness';

@Controller('admin/healthcare-network')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class HealthcareNetworkAdminController {
  constructor(
    private readonly readiness: HealthcarePartnerReadinessService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('snapshot')
  @RequirePermissions('policy:read')
  snapshot(@Query('country_code') countryCode?: string, @CurrentPrincipal() principal?: Principal) {
    this.assertAdmin(principal);
    return this.readiness.networkSnapshot(countryCode);
  }

  @Get('integrations')
  @RequirePermissions('policy:read')
  integrations(@CurrentPrincipal() principal: Principal) {
    this.assertAdmin(principal);
    return this.readiness.listIntegrationGates();
  }

  @Get('production-availability')
  @RequirePermissions('policy:read')
  async productionAvailability(
    @Query('country_code') countryCode: string,
    @Query('kind') kind: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertAdmin(principal);
    if (!countryCode) throw Errors.validation('country_code is required');
    const providerKind = this.parseKind(kind ?? 'DOCTOR');
    return evaluateProductionHealthcareAvailable(this.prisma, {
      countryCode,
      kind: providerKind,
    });
  }

  @Get('doctors/:partnerId/readiness')
  @RequirePermissions('doctor:review')
  doctorReadiness(@Param('partnerId') partnerId: string, @CurrentPrincipal() principal: Principal) {
    this.assertAdmin(principal);
    return this.readiness.evaluateDoctor(partnerId);
  }

  @Get('labs/:organizationId/readiness')
  @RequirePermissions('policy:read')
  labReadiness(
    @Param('organizationId') organizationId: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertAdmin(principal);
    return this.readiness.evaluateLab(organizationId);
  }

  @Get('imaging/:organizationId/readiness')
  @RequirePermissions('policy:read')
  imagingReadiness(
    @Param('organizationId') organizationId: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    this.assertAdmin(principal);
    return this.readiness.evaluateImaging(organizationId);
  }

  private parseKind(kind: string): HealthcareProviderKind {
    const upper = kind.trim().toUpperCase();
    if (
      upper === 'DOCTOR' ||
      upper === 'LAB' ||
      upper === 'IMAGING_CENTER' ||
      upper === 'RADIOLOGIST'
    ) {
      return upper;
    }
    throw Errors.validation('kind must be DOCTOR, LAB, IMAGING_CENTER, or RADIOLOGIST');
  }

  private assertAdmin(principal: Principal | undefined) {
    if (!principal || principal.audience !== 'admin') {
      throw Errors.forbidden();
    }
  }
}

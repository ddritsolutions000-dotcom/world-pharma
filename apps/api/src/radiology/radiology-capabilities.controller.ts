import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { assertImagingOrgAccess } from '../catalog/access';
import { PrismaService } from '../app/prisma.service';
import { RadiologyCapabilityService } from './radiology-capability.service';

@Controller('radiology/capabilities')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class RadiologyCapabilitiesController {
  constructor(
    private readonly capabilities: RadiologyCapabilityService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('eligibility')
  async eligibility(@CurrentPrincipal() principal: Principal, @Query('imaging_org_id') imagingOrgId: string) {
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required.');
    }
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    return this.capabilities.evaluate(imagingOrgId);
  }

  @Post('attest')
  async attest(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { imaging_org_id?: string; attestation_code?: string },
  ) {
    const imagingOrgId = String(body.imaging_org_id ?? '');
    const code = String(body.attestation_code ?? '');
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required.');
    }
    return this.capabilities.attest(principal, imagingOrgId, code);
  }

  @Get('activity')
  async activity(@CurrentPrincipal() principal: Principal, @Query('imaging_org_id') imagingOrgId: string) {
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required.');
    }
    return this.capabilities.listImagingActivity(principal, imagingOrgId);
  }
}

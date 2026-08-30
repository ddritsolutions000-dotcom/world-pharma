import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { assertLabOrgAccess } from '../catalog/access';
import { PrismaService } from '../app/prisma.service';
import { LabCapabilityService } from './lab-capability.service';

@Controller('lab/capabilities')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class LabCapabilitiesController {
  constructor(
    private readonly capabilities: LabCapabilityService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('eligibility')
  async eligibility(@CurrentPrincipal() principal: Principal, @Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required.');
    }
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    return this.capabilities.evaluate(labOrgId);
  }

  @Post('attest')
  async attest(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { lab_org_id?: string; attestation_code?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    const code = String(body.attestation_code ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required.');
    }
    return this.capabilities.attest(principal, labOrgId, code);
  }

  @Get('activity')
  async activity(@CurrentPrincipal() principal: Principal, @Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required.');
    }
    return this.capabilities.listLabActivity(principal, labOrgId);
  }
}

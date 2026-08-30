import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PathologyService } from './pathology.service';

@Controller('pathologist')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class PathologistController {
  constructor(private readonly pathology: PathologyService) {}

  @Get('work')
  listWork(@CurrentPrincipal() principal: Principal, @Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.pathology.listPathologistWork(principal, labOrgId);
  }

  @Get('reports/:id')
  getReport(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('lab_org_id') labOrgId: string,
  ) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.pathology.getReportForPathologist(principal, labOrgId, id);
  }

  @Post('reports/:id/assign')
  assign(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { lab_org_id?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.pathology.assignPathologist(principal, labOrgId, id);
  }

  @Post('reports/:id/verify')
  verify(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { lab_org_id?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.pathology.verifyReport(principal, labOrgId, id);
  }

  @Post('reports/:id/publish')
  publish(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { lab_org_id?: string; idempotency_key?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.pathology.publishReport(principal, labOrgId, id, body.idempotency_key);
  }

  @Post('reports/:id/amend')
  amend(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { lab_org_id?: string; reason?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.pathology.amendReport(principal, labOrgId, id, String(body.reason ?? ''));
  }
}

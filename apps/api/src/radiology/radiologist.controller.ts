import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { InterpretationService } from './interpretation.service';

@Controller('radiologist')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class RadiologistController {
  constructor(private readonly interpretation: InterpretationService) {}

  @Get('organizations')
  listOrganizations(@CurrentPrincipal() principal: Principal) {
    return this.interpretation.listRadiologistOrganizations(principal);
  }

  @Get('worklist')
  listWorklist(@CurrentPrincipal() principal: Principal, @Query('imaging_org_id') imagingOrgId: string) {
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.interpretation.listWorklist(principal, imagingOrgId);
  }

  @Get('verify-queue')
  listVerifyQueue(@CurrentPrincipal() principal: Principal, @Query('imaging_org_id') imagingOrgId: string) {
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.interpretation.listVerifyQueue(principal, imagingOrgId);
  }

  @Get('cases/:id')
  getCase(
    @CurrentPrincipal() principal: Principal,
    @Param('id') studyId: string,
    @Query('imaging_org_id') imagingOrgId: string,
  ) {
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.interpretation.getCaseByStudyId(principal, imagingOrgId, studyId);
  }

  @Post('reports/:id/assign')
  assign(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { imaging_org_id?: string },
  ) {
    const imagingOrgId = String(body.imaging_org_id ?? '');
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.interpretation.assignRadiologist(principal, imagingOrgId, id);
  }

  @Post('reports/:id/findings')
  enterFindings(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: {
      imaging_org_id?: string;
      summary?: string;
      findings?: Array<{
        finding_code: string;
        finding_text: string;
        body_region_code?: string;
        severity_code?: string;
        sort_order?: number;
      }>;
    },
  ) {
    const imagingOrgId = String(body.imaging_org_id ?? '');
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.interpretation.enterFindings(principal, imagingOrgId, id, {
      summary: body.summary,
      findings: body.findings ?? [],
    });
  }

  @Post('reports/:id/submit')
  submit(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { imaging_org_id?: string },
  ) {
    const imagingOrgId = String(body.imaging_org_id ?? '');
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.interpretation.submitForVerify(principal, imagingOrgId, id);
  }

  @Post('reports/:id/verify')
  verify(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { imaging_org_id?: string },
  ) {
    const imagingOrgId = String(body.imaging_org_id ?? '');
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.interpretation.verifyReport(principal, imagingOrgId, id);
  }

  @Post('reports/:id/publish')
  publish(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { imaging_org_id?: string; idempotency_key?: string },
  ) {
    const imagingOrgId = String(body.imaging_org_id ?? '');
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.interpretation.publishReport(principal, imagingOrgId, id, body.idempotency_key);
  }

  @Post('reports/:id/amend')
  amend(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { imaging_org_id?: string; reason?: string },
  ) {
    const imagingOrgId = String(body.imaging_org_id ?? '');
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.interpretation.amendReport(principal, imagingOrgId, id, String(body.reason ?? ''));
  }
}

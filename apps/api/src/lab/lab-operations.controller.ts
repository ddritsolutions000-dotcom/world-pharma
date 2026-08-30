import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { LabDiagnosticsOpsService } from './lab-diagnostics-ops.service';
import { PathologyService } from './pathology.service';
import { PhysicalReportService } from './physical-report.service';

@Controller('lab')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class LabOperationsController {
  constructor(
    private readonly ops: LabDiagnosticsOpsService,
    private readonly pathology: PathologyService,
    private readonly physicalReports: PhysicalReportService,
  ) {}

  @Get('transport')
  listTransport(@CurrentPrincipal() principal: Principal, @Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.ops.listTransport(principal, labOrgId);
  }

  @Post('samples/:id/receive')
  receive(
    @CurrentPrincipal() principal: Principal,
    @Param('id') sampleId: string,
    @Body() body: { lab_org_id?: string; idempotency_key?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.ops.receiveAtLab(principal, labOrgId, sampleId, body.idempotency_key);
  }

  @Get('accessions')
  listAccessions(@CurrentPrincipal() principal: Principal, @Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.ops.listAccessions(principal, labOrgId);
  }

  @Get('accessions/:id')
  getAccession(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('lab_org_id') labOrgId: string,
  ) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.ops.getAccession(principal, labOrgId, id);
  }

  @Post('accessions')
  accession(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { lab_org_id?: string; lab_sample_id?: string; idempotency_key?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    const sampleId = String(body.lab_sample_id ?? '');
    if (!labOrgId || !sampleId) {
      throw Errors.validation('lab_org_id and lab_sample_id are required');
    }
    return this.ops.accessionSample(principal, labOrgId, sampleId, body.idempotency_key);
  }

  @Get('processing')
  listProcessing(@CurrentPrincipal() principal: Principal, @Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.ops.listProcessing(principal, labOrgId);
  }

  @Get('processing/:id')
  getProcessing(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('lab_org_id') labOrgId: string,
  ) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.ops.getProcessing(principal, labOrgId, id);
  }

  @Post('processing/:id/start')
  startProcessing(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { lab_org_id?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.ops.startProcessing(principal, labOrgId, id);
  }

  @Post('processing/:id/complete')
  completeProcessing(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { lab_org_id?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.ops.completeProcessing(principal, labOrgId, id);
  }

  @Post('processing/:id/hold')
  holdProcessing(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { lab_org_id?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.ops.holdProcessing(principal, labOrgId, id);
  }

  @Post('processing/:id/fail')
  failProcessing(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { lab_org_id?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.ops.failProcessing(principal, labOrgId, id);
  }

  @Get('pathology')
  listPathology(@CurrentPrincipal() principal: Principal, @Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.pathology.listLabPathology(principal, labOrgId);
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
    return this.pathology.getReportForLab(principal, labOrgId, id);
  }

  @Post('reports/:id/results')
  enterResults(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: {
      lab_org_id?: string;
      summary?: string;
      lines?: Array<{
        analyte_code: string;
        analyte_name: string;
        value: string;
        unit?: string;
        reference_range?: string;
      }>;
      idempotency_key?: string;
    },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.pathology.enterResults(principal, labOrgId, id, {
      summary: body.summary,
      lines: body.lines ?? [],
      idempotency_key: body.idempotency_key,
    });
  }

  @Post('reports/:id/submit-verify')
  submitVerify(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { lab_org_id?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.pathology.submitForVerify(principal, labOrgId, id);
  }

  @Get('physical-reports')
  listPhysicalReports(@CurrentPrincipal() principal: Principal, @Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.physicalReports.listLabRequests(principal, labOrgId);
  }

  @Get('physical-reports/:id')
  getPhysicalReport(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('lab_org_id') labOrgId: string,
  ) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.physicalReports.getLabRequest(principal, labOrgId, id);
  }

  @Post('physical-reports/:id/accept')
  acceptPhysicalReport(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { lab_org_id?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.physicalReports.acceptRequest(principal, labOrgId, id);
  }

  @Post('physical-reports/:id/prepare')
  preparePhysicalReport(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { lab_org_id?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.physicalReports.prepareRequest(principal, labOrgId, id);
  }

  @Post('physical-reports/:id/pack')
  packPhysicalReport(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { lab_org_id?: string; sealed_package_id?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.physicalReports.packRequest(principal, labOrgId, id, String(body.sealed_package_id ?? ''));
  }

  @Post('physical-reports/:id/dispatch')
  dispatchPhysicalReport(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { lab_org_id?: string; idempotency_key?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.physicalReports.dispatchRequest(principal, labOrgId, id, body.idempotency_key);
  }

  @Post('physical-reports/:id/cancel')
  cancelPhysicalReport(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { lab_org_id?: string; reason?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.physicalReports.cancelLabRequest(principal, labOrgId, id, body.reason);
  }

  @Post('physical-reports/:id/fail')
  failPhysicalReport(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { lab_org_id?: string; reason?: string; code?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.physicalReports.failRequest(principal, labOrgId, id, body.reason ?? 'failed', body.code);
  }
}

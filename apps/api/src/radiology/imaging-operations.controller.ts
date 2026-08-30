import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { ImagingPhysicalReportService } from './imaging-physical-report.service';

@Controller('radiology')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class ImagingOperationsController {
  constructor(private readonly physicalReports: ImagingPhysicalReportService) {}

  @Get('physical-reports')
  list(@CurrentPrincipal() principal: Principal, @Query('imaging_org_id') imagingOrgId: string) {
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.physicalReports.listImagingOrgRequests(principal, imagingOrgId);
  }

  @Get('physical-reports/:id')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('imaging_org_id') imagingOrgId: string,
  ) {
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.physicalReports.getImagingOrgRequest(principal, imagingOrgId, id);
  }

  @Post('physical-reports/:id/accept')
  accept(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { imaging_org_id?: string },
  ) {
    const imagingOrgId = String(body.imaging_org_id ?? '');
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.physicalReports.acceptRequest(principal, imagingOrgId, id);
  }

  @Post('physical-reports/:id/prepare')
  prepare(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { imaging_org_id?: string },
  ) {
    const imagingOrgId = String(body.imaging_org_id ?? '');
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.physicalReports.prepareRequest(principal, imagingOrgId, id);
  }

  @Post('physical-reports/:id/pack')
  pack(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { imaging_org_id?: string; sealed_package_id?: string },
  ) {
    const imagingOrgId = String(body.imaging_org_id ?? '');
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.physicalReports.packRequest(principal, imagingOrgId, id, String(body.sealed_package_id ?? ''));
  }

  @Post('physical-reports/:id/dispatch')
  dispatch(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { imaging_org_id?: string; idempotency_key?: string },
  ) {
    const imagingOrgId = String(body.imaging_org_id ?? '');
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.physicalReports.dispatchRequest(principal, imagingOrgId, id, body.idempotency_key);
  }

  @Post('physical-reports/:id/cancel')
  cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { imaging_org_id?: string; reason?: string },
  ) {
    const imagingOrgId = String(body.imaging_org_id ?? '');
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.physicalReports.cancelImagingOrgRequest(principal, imagingOrgId, id, body.reason);
  }

  @Post('physical-reports/:id/fail')
  fail(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { imaging_org_id?: string; reason?: string; code?: string },
  ) {
    const imagingOrgId = String(body.imaging_org_id ?? '');
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.physicalReports.failRequest(principal, imagingOrgId, id, body.reason ?? 'failed', body.code);
  }
}

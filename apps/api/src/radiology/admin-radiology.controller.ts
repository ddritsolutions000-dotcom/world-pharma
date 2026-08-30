import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { RadiologyCapabilityService } from './radiology-capability.service';
import { InterpretationService } from './interpretation.service';
import { ImagingPhysicalReportService } from './imaging-physical-report.service';

@Controller('admin/imaging')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminRadiologyController {
  constructor(
    private readonly capabilities: RadiologyCapabilityService,
    private readonly interpretation: InterpretationService,
    private readonly physicalReports: ImagingPhysicalReportService,
  ) {}

  @Get('eligibility')
  @RequirePermissions('partner:manage')
  async get(@Query('imaging_org_id') imagingOrgId: string) {
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required.');
    }
    return this.capabilities.evaluate(imagingOrgId);
  }

  @Post('acceptance')
  @RequirePermissions('partner:manage')
  async acceptance(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { imaging_org_id?: string; action?: 'accept' | 'block' | 'reset'; reason?: string },
  ) {
    const imagingOrgId = String(body.imaging_org_id ?? '');
    const action = body.action;
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required.');
    }
    if (action !== 'accept' && action !== 'block' && action !== 'reset') {
      throw Errors.validation('action must be accept, block, or reset.');
    }
    return this.capabilities.setAcceptance(principal.personId, imagingOrgId, action, body.reason);
  }

  @Get('reports')
  @RequirePermissions('partner:manage')
  async reports(@Query('imaging_org_id') imagingOrgId: string) {
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required.');
    }
    return this.interpretation.listAdminImagingReportMetadata(imagingOrgId);
  }

  @Get('physical-reports')
  @RequirePermissions('partner:manage')
  async listPhysicalReports(@Query('imaging_org_id') imagingOrgId?: string) {
    return this.physicalReports.listAdminMetadata(imagingOrgId);
  }
}

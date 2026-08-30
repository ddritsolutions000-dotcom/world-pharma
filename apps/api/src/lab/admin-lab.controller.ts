import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { LabCapabilityService } from './lab-capability.service';
import { PathologyService } from './pathology.service';
import { PhysicalReportService } from './physical-report.service';
import { SampleCollectionService } from './sample-collection.service';

@Controller('admin/lab')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminLabController {
  constructor(
    private readonly capabilities: LabCapabilityService,
    private readonly collections: SampleCollectionService,
    private readonly pathology: PathologyService,
    private readonly physicalReports: PhysicalReportService,
  ) {}

  @Get('eligibility')
  @RequirePermissions('partner:manage')
  async get(@Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required.');
    }
    return this.capabilities.evaluate(labOrgId);
  }

  @Post('acceptance')
  @RequirePermissions('partner:manage')
  async acceptance(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { lab_org_id?: string; action?: 'accept' | 'block' | 'reset'; reason?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    const action = body.action;
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required.');
    }
    if (action !== 'accept' && action !== 'block' && action !== 'reset') {
      throw Errors.validation('action must be accept, block, or reset.');
    }
    return this.capabilities.setAcceptance(principal.personId, labOrgId, action, body.reason);
  }

  @Post('collections/assign')
  @RequirePermissions('partner:manage')
  assignPhlebotomist(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { lab_org_id?: string; lab_sample_id?: string; assignee_person_id?: string },
  ) {
    const labOrgId = String(body.lab_org_id ?? '');
    const labSampleId = String(body.lab_sample_id ?? '');
    const assigneePersonId = String(body.assignee_person_id ?? '');
    if (!labOrgId || !labSampleId || !assigneePersonId) {
      throw Errors.validation('lab_org_id, lab_sample_id, and assignee_person_id are required.');
    }
    return this.collections.assignPhlebotomist(principal.personId, labOrgId, labSampleId, assigneePersonId);
  }

  @Get('reports')
  @RequirePermissions('partner:manage')
  listReports(@Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required.');
    }
    return this.pathology.listAdminReportMetadata(labOrgId);
  }

  @Get('physical-reports')
  @RequirePermissions('partner:manage')
  listPhysicalReports(@Query('lab_org_id') labOrgId?: string) {
    return this.physicalReports.listAdminMetadata(labOrgId);
  }
}

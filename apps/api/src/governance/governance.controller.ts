import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { OrganizationStatus } from '@prisma/client';
import { Errors } from '../common/problem';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { GovernanceService } from './governance.service';

@Controller('admin/governance')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class GovernanceController {
  constructor(private readonly governance: GovernanceService) {}

  @Get('regions')
  @RequirePermissions('policy:read')
  async regions() {
    return { data: await this.governance.listRegions() };
  }

  @Get('countries')
  @RequirePermissions('policy:read')
  async countries() {
    return { data: await this.governance.listCountries() };
  }

  @Get('legal-entities')
  @RequirePermissions('finance:read')
  async legalEntities() {
    return { data: await this.governance.listLegalEntities() };
  }

  @Get('business-units')
  @RequirePermissions('policy:read')
  async businessUnits() {
    return { data: await this.governance.listBusinessUnits() };
  }

  @Get('organizations')
  @RequirePermissions('partner:manage')
  async organizations() {
    return { data: await this.governance.listOrganizations() };
  }

  @Patch('organizations/:id')
  @RequirePermissions('partner:manage')
  async patchOrganization(
    @Param('id') id: string,
    @Body() body: { display_name?: string; legal_name?: string; status?: OrganizationStatus },
  ) {
    return this.governance.patchOrganization(id, body);
  }

  @Get('locations')
  @RequirePermissions('partner:manage')
  async locations(@Query('organization_id') organizationId?: string) {
    return { data: await this.governance.listLocations(organizationId) };
  }

  @Get('memberships')
  @RequirePermissions('identity:audit_read')
  async memberships(
    @Query('person_id') personId?: string,
    @Query('organization_id') organizationId?: string,
  ) {
    if (!personId && !organizationId) {
      throw Errors.validation('person_id or organization_id is required.');
    }
    return { data: await this.governance.listMemberships({ personId, organizationId }) };
  }
}

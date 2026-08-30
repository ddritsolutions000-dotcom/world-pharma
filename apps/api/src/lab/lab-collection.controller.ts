import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { SampleCollectionService } from './sample-collection.service';

@Controller('lab/collections')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class LabCollectionController {
  constructor(private readonly collections: SampleCollectionService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.collections.listLabCollections(principal, labOrgId);
  }

  @Get(':id')
  get(
    @CurrentPrincipal() principal: Principal,
    @Query('lab_org_id') labOrgId: string,
    @Param('id') id: string,
  ) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.collections.getLabCollection(principal, labOrgId, id);
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { LabWorkforceService } from './lab-workforce.service';

@Controller('lab/team')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class LabWorkforceController {
  constructor(private readonly workforce: LabWorkforceService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.workforce.listTeam(principal, labOrgId);
  }
}

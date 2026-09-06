import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { LabEarningsService } from './lab-earnings.service';

@Controller('lab/earnings')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class LabEarningsController {
  constructor(private readonly earnings: LabEarningsService) {}

  @Get('summary')
  summary(@CurrentPrincipal() principal: Principal, @Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.earnings.summary(principal, labOrgId);
  }

  @Get('bookings')
  bookings(@CurrentPrincipal() principal: Principal, @Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.earnings.bookings(principal, labOrgId);
  }
}

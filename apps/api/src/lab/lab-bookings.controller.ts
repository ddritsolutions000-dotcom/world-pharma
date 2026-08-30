import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { LabBookingService } from './lab-booking.service';

@Controller('lab/bookings')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class LabBookingsController {
  constructor(private readonly bookings: LabBookingService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.bookings.listLabOrgBookings(principal, labOrgId);
  }

  @Get(':id')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('lab_org_id') labOrgId: string,
  ) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.bookings.getLabOrgBooking(principal, labOrgId, id);
  }
}

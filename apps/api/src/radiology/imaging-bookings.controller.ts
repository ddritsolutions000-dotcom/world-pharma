import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { ImagingBookingService } from './imaging-booking.service';

@Controller('radiology/bookings')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class ImagingBookingsController {
  constructor(private readonly bookings: ImagingBookingService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query('imaging_org_id') imagingOrgId: string) {
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.bookings.listImagingOrgBookings(principal, imagingOrgId);
  }

  @Get(':id')
  get(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Query('imaging_org_id') imagingOrgId: string,
  ) {
    if (!imagingOrgId) {
      throw Errors.validation('imaging_org_id is required');
    }
    return this.bookings.getImagingOrgBooking(principal, imagingOrgId, id);
  }
}

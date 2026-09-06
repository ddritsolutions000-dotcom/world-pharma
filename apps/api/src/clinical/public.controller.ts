import { Controller, Get, Param, Query } from '@nestjs/common';
import { Errors } from '../common/problem';
import { AppointmentService } from './appointment.service';

@Controller('public/care')
export class PublicCareController {
  constructor(private readonly appointments: AppointmentService) {}

  @Get('doctors')
  directory(@Query('country_code') countryCode: string | undefined) {
    if (!countryCode) {
      throw Errors.validation('country_code is required');
    }
    return this.appointments.directory(countryCode);
  }

  @Get('doctors/:profileId')
  profile(@Param('profileId') profileId: string, @Query('country_code') countryCode: string | undefined) {
    if (!countryCode) {
      throw Errors.validation('country_code is required');
    }
    return this.appointments.publicProfile(profileId, countryCode);
  }
}

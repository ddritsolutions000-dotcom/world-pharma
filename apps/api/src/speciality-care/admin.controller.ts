import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { SpecialityCareService } from './speciality-care.service';

@Controller('admin/speciality-care')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class AdminSpecialityCareController {
  constructor(private readonly speciality: SpecialityCareService) {}

  @Get('programs')
  @RequirePermissions('doctor:review')
  programs(@Query('country_code') countryCode?: string) {
    return this.speciality.getSpecialityPrograms(null, countryCode);
  }

  @Get('vaccinations')
  @RequirePermissions('doctor:review')
  vaccinations(@Query('country_code') countryCode?: string) {
    return this.speciality.getVaccinationServices(null, countryCode);
  }
}

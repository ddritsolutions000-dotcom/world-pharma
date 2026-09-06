import { Controller, Get, Param, Query } from '@nestjs/common';
import { SpecialityCareService } from './speciality-care.service';

@Controller('public/speciality-care')
export class PublicSpecialityCareController {
  constructor(private readonly specialityCare: SpecialityCareService) {}

  @Get('programs')
  programs(@Query('country_code') countryCode?: string) {
    return this.specialityCare.getSpecialityPrograms(null, countryCode);
  }

  @Get('programs/:program_id')
  detail(@Param('program_id') programId: string, @Query('country_code') countryCode?: string) {
    return this.specialityCare.getProgramDetails(null, programId, countryCode);
  }

  @Get('vaccinations')
  vaccinations(@Query('country_code') countryCode?: string) {
    return this.specialityCare.getVaccinationServices(null, countryCode);
  }
}

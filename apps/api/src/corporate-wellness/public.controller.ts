import { Controller, Get, Query } from '@nestjs/common';
import { CorporateWellnessService } from './corporate-wellness.service';

@Controller('public/corporate')
export class PublicCorporateWellnessController {
  constructor(private readonly corporateWellness: CorporateWellnessService) {}

  @Get('programs')
  programs(@Query('country_code') countryCode?: string) {
    return this.corporateWellness.getCorporatePrograms(null, countryCode);
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { CustomerPromoService } from './customer-promo.service';

@Controller('me/promo')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class CustomerPromoController {
  constructor(private readonly promos: CustomerPromoService) {}

  @Get('available')
  listAvailable(@Query('country_code') countryCode?: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required.');
    }
    return this.promos.listAvailable(countryCode.trim());
  }
}

import { Controller, Get, Param, Query } from '@nestjs/common';
import { Errors } from '../common/problem';
import { MedicineSubstituteService } from './medicine-substitute.service';

/** Guest PDP substitutes — 1mg-style alternatives without login. */
@Controller('public/catalog')
export class PublicMedicineSubstituteController {
  constructor(private readonly substitutes: MedicineSubstituteService) {}

  @Get('items/:item_id/substitutes')
  getSubstitutes(
    @Param('item_id') itemId: string,
    @Query('country_code') countryCode?: string,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.substitutes.getSubstitutes(null, itemId, countryCode);
  }
}

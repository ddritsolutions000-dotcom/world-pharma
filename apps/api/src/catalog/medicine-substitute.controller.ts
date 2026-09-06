import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { requireCountryCode } from './catalog-country';
import { MedicineSubstituteService } from './medicine-substitute.service';

/**
 * Customer-facing medicine substitute controller - 1mg-style
 * Provides cheaper alternatives, generics, and price comparison
 */
@Controller('customer/medicine-substitutes')
@UseGuards(JwtAuthGuard, AudienceGuard)
export class MedicineSubstituteController {
  constructor(private readonly substituteService: MedicineSubstituteService) {}

  /**
   * Get medicine substitutes for a given medicine
   * Returns cheaper alternatives with price comparison
   */
  @Get(':item_id')
  @RequireAudiences('customer')
  async getSubstitutes(
    @CurrentPrincipal() principal: Principal,
    @Param('item_id') itemId: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.substituteService.getSubstitutes(principal, itemId, requireCountryCode(countryCode));
  }

  /**
   * Get price comparison across multiple sellers
   */
  @Get(':item_id/price-comparison')
  @RequireAudiences('customer')
  async getPriceComparison(
    @CurrentPrincipal() principal: Principal,
    @Param('item_id') itemId: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.substituteService.getPriceComparison(principal, itemId, requireCountryCode(countryCode));
  }

  /**
   * Get generic alternatives for branded medicines
   */
  @Get(':item_id/generics')
  @RequireAudiences('customer')
  async getGenericAlternatives(
    @CurrentPrincipal() principal: Principal,
    @Param('item_id') itemId: string,
    @Query('country_code') countryCode?: string,
  ) {
    return this.substituteService.getGenericAlternatives(principal, itemId, requireCountryCode(countryCode));
  }
}

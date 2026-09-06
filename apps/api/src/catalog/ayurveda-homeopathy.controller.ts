import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { AyurvedaHomeopathyService } from './ayurveda-homeopathy.service';

/**
 * Customer-facing Ayurveda and Homeopathy controller - 1mg-style
 * Provides specialized categories for alternative medicine products
 */
@Controller('customer/alternative-medicine')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class AyurvedaHomeopathyController {
  constructor(
    private readonly alternativeMedicine: AyurvedaHomeopathyService
  ) {}

  /**
   * Get Ayurveda products (1mg-style Ayurveda category)
   */
  @Get('ayurveda')
  async getAyurvedaProducts(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.alternativeMedicine.getAyurvedaProducts(principal, {
      country_code: countryCode,
      category,
      search,
      limit: parsedLimit,
    });
  }

  /**
   * Get Homeopathy products (1mg-style Homeopathy category)
   */
  @Get('homeopathy')
  async getHomeopathyProducts(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.alternativeMedicine.getHomeopathyProducts(principal, {
      country_code: countryCode,
      category,
      search,
      limit: parsedLimit,
    });
  }

  /**
   * Get Ayurveda categories (1mg-style subcategories)
   */
  @Get('ayurveda/categories')
  async getAyurvedaCategories(@CurrentPrincipal() principal: Principal) {
    return this.alternativeMedicine.getAyurvedaCategories();
  }

  /**
   * Get Homeopathy categories (1mg-style subcategories)
   */
  @Get('homeopathy/categories')
  async getHomeopathyCategories(@CurrentPrincipal() principal: Principal) {
    return this.alternativeMedicine.getHomeopathyCategories();
  }

  /**
   * Get alternative medicine brands (1mg-style brand showcase)
   */
  @Get('brands')
  async getAlternativeMedicineBrands(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string
  ) {
    return this.alternativeMedicine.getAlternativeMedicineBrands(principal, countryCode);
  }

  /**
   * Get health conditions and remedies (1mg-style condition-based shopping)
   */
  @Get('conditions')
  async getConditionBasedRemedies(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string
  ) {
    return this.alternativeMedicine.getConditionBasedRemedies(principal, countryCode);
  }
}

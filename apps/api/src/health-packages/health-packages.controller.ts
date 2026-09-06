import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { HealthPackagesService } from './health-packages.service';

/**
 * Customer-facing health packages controller - 1mg-style health checkup packages
 * Provides comprehensive health checkups, specialized packages, and preventive screenings
 */
@Controller('customer/health-packages')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class HealthPackagesController {
  constructor(private readonly healthPackages: HealthPackagesService) {}

  @Get()
  async getHealthPackages(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('category') category?: string,
    @Query('gender') gender?: string,
    @Query('age_group') ageGroup?: string,
    @Query('price_range') priceRange?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.healthPackages.getHealthPackages(principal, {
      country_code: countryCode,
      category,
      gender,
      age_group: ageGroup,
      price_range: priceRange,
      search,
      limit: parsedLimit,
    });
  }

  @Get('popular')
  async getPopularPackages(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.healthPackages.getPopularPackages(principal, countryCode);
  }

  @Get('concern/:concern')
  async getPackagesByConcern(
    @CurrentPrincipal() principal: Principal,
    @Param('concern') concern: string,
    @Query('country_code') countryCode?: string,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.healthPackages.getPackagesByConcern(principal, concern, countryCode);
  }

  @Get(':package_id')
  async getPackageDetails(
    @CurrentPrincipal() principal: Principal,
    @Param('package_id') packageId: string,
    @Query('country_code') countryCode?: string,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.healthPackages.getPackageDetails(principal, packageId, countryCode);
  }

  @Post('book')
  async bookHealthPackage(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      package_id: string;
      country_code?: string;
      preferred_date?: string;
      preferred_time?: string;
      home_collection?: boolean;
      address?: any;
      patient_details?: any;
    }
  ) {
    return this.healthPackages.bookHealthPackage(principal, body);
  }
}

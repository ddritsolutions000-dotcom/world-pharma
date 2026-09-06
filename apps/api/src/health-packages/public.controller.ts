import { Controller, Get, Param, Query } from '@nestjs/common';
import { Errors } from '../common/problem';
import { HealthPackagesService } from './health-packages.service';

@Controller('public/health-packages')
export class PublicHealthPackagesController {
  constructor(private readonly healthPackages: HealthPackagesService) {}

  @Get()
  list(
    @Query('country_code') countryCode?: string,
    @Query('category') category?: string,
    @Query('gender') gender?: string,
    @Query('age_group') ageGroup?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.healthPackages.getHealthPackages(null, {
      country_code: countryCode,
      category,
      gender,
      age_group: ageGroup,
      search,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Get('popular')
  popular(@Query('country_code') countryCode?: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.healthPackages.getPopularPackages(null, countryCode);
  }

  @Get('concern/:concern')
  concern(@Param('concern') concern: string, @Query('country_code') countryCode?: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.healthPackages.getPackagesByConcern(null, concern, countryCode);
  }

  @Get(':package_id')
  detail(@Param('package_id') packageId: string, @Query('country_code') countryCode?: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.healthPackages.getPackageDetails(null, packageId, countryCode);
  }
}

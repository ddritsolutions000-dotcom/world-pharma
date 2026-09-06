import { Controller, Get, Query } from '@nestjs/common';
import { StoreLocatorService } from './store-locator.service';

/** Guest store finder — 1mg-style pharmacy locator (no login required). */
@Controller('public/store-locator')
export class PublicStoreLocatorController {
  constructor(private readonly storeLocator: StoreLocatorService) {}

  @Get('nearby')
  nearby(
    @Query('country_code') countryCode?: string,
    @Query('city') city?: string,
    @Query('pincode') pincode?: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('radius') radius?: string,
    @Query('limit') limit?: string,
  ) {
    return this.storeLocator.listPublic({
      country_code: countryCode,
      city,
      pincode,
      latitude: latitude ? Number(latitude) : undefined,
      longitude: longitude ? Number(longitude) : undefined,
      radius: radius ? Number(radius) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}

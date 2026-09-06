import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { StoreLocatorService } from './store-locator.service';

/**
 * Customer-facing store locator controller - 1mg-style physical store network
 * Provides store location, directions, services, and inventory availability
 */
@Controller('customer/store-locator')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class StoreLocatorController {
  constructor(private readonly storeLocator: StoreLocatorService) {}

  /**
   * Get nearby stores (1mg-style store locator)
   */
  @Get('nearby')
  async getNearbyStores(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('radius') radius?: string,
    @Query('store_type') storeType?: string,
    @Query('services') services?: string,
    @Query('limit') limit?: string
  ) {
    const parsedServices = services ? services.split(',') : [];
    return this.storeLocator.getNearbyStores(principal, {
      country_code: countryCode,
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      radius: radius ? parseFloat(radius) : undefined,
      store_type: storeType,
      services: parsedServices,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * Get store details (1mg-style store information)
   */
  @Get('stores/:store_id')
  async getStoreDetails(
    @CurrentPrincipal() principal: Principal,
    @Param('store_id') storeId: string,
    @Query('country_code') countryCode?: string
  ) {
    return this.storeLocator.getStoreDetails(principal, storeId, countryCode);
  }

  /**
   * Get store inventory (1mg-style store availability)
   */
  @Get('stores/:store_id/inventory')
  async getStoreInventory(
    @CurrentPrincipal() principal: Principal,
    @Param('store_id') storeId: string,
    @Query('country_code') countryCode?: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string
  ) {
    return this.storeLocator.getStoreInventory(principal, storeId, {
      country_code: countryCode,
      search,
      category,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  /**
   * Get store services (1mg-style service availability)
   */
  @Get('stores/:store_id/services')
  async getStoreServices(
    @CurrentPrincipal() principal: Principal,
    @Param('store_id') storeId: string,
    @Query('country_code') countryCode?: string
  ) {
    return this.storeLocator.getStoreServices(principal, storeId, countryCode);
  }

  /**
   * Search stores by city/area (1mg-style location search)
   */
  @Get('search')
  async searchStoresByLocation(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('city') city?: string,
    @Query('area') area?: string,
    @Query('pincode') pincode?: string,
    @Query('limit') limit?: string
  ) {
    return this.storeLocator.searchStoresByLocation(principal, {
      country_code: countryCode,
      city,
      area,
      pincode,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}

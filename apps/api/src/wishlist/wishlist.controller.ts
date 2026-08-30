import { Body, Controller, Delete, Get, Headers, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { WishlistService } from './wishlist.service';

@Controller('me/wishlist')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal, @Query('country_code') countryCode?: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    return this.wishlist.list(principal, countryCode);
  }

  @Post()
  @HttpCode(201)
  add(
    @CurrentPrincipal() principal: Principal,
    @Body() body: { country_code?: string; catalog_offer_id?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.wishlist.add(
      principal,
      {
        country_code: body.country_code ?? '',
        catalog_offer_id: body.catalog_offer_id ?? '',
      },
      idempotencyKey,
    );
  }

  @Delete()
  remove(
    @CurrentPrincipal() principal: Principal,
    @Query('country_code') countryCode?: string,
    @Query('catalog_offer_id') catalogOfferId?: string,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    if (catalogOfferId?.trim()) {
      return this.wishlist.remove(principal, countryCode, catalogOfferId);
    }
    return this.wishlist.clear(principal, countryCode);
  }
}

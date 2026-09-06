import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Errors } from '../common/problem';
import { CatalogService } from './catalog.service';
import { PricingService } from './pricing.service';
import { toMinor } from './money';

const quoteSchema = z
  .object({
    offer_id: z.string().uuid(),
    quantity: z.union([z.string(), z.number()]),
  })
  .strict();

@Controller()
export class CatalogCustomerController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly pricing: PricingService,
  ) {}

  @Get('catalog/brands')
  brands(@Query('country') country: string, @Query('locale') locale?: string) {
    if (!country) {
      throw Errors.validation('country query parameter is required');
    }
    void locale;
    return this.catalog.listBrands(country);
  }

  @Get('catalog/categories')
  categories(@Query('country') country: string, @Query('locale') locale?: string) {
    if (!country) {
      throw Errors.validation('country query parameter is required');
    }
    void locale;
    return this.catalog.listCategories(country);
  }

  @Get('catalog/items')
  browse(
    @Query('country') country: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('manufacturer') manufacturer?: string,
    @Query('rx') rx?: string,
    @Query('in_stock') inStock?: string,
    @Query('sort') sort?: string,
    @Query('cursor') cursor?: string,
    @Query('locale') locale?: string,
  ) {
    if (!country) {
      throw Errors.validation('country query parameter is required');
    }
    const parsedSort =
      sort === 'price_asc' ||
      sort === 'price_desc' ||
      sort === 'rating' ||
      sort === 'discount' ||
      sort === 'relevance'
        ? sort
        : undefined;
    return this.catalog.customerBrowse(country, {
      q,
      category,
      brand,
      manufacturer,
      rx: rx === undefined ? undefined : rx === 'true',
      in_stock: inStock === undefined ? undefined : inStock === 'true',
      sort: parsedSort,
      cursor,
      locale,
    });
  }

  @Get('catalog/items/:slug')
  item(
    @Param('slug') slug: string,
    @Query('country') country: string,
    @Query('postal_code') postalCode?: string,
  ) {
    if (!country) {
      throw Errors.validation('country query parameter is required');
    }
    return this.catalog.customerItem(country, slug, postalCode);
  }

  @Get('catalog/search')
  search(
    @Query('country') country: string,
    @Query('q') q: string,
    @Query('locale') locale?: string,
  ) {
    if (!country) {
      throw Errors.validation('country query parameter is required');
    }
    return this.catalog.search(country, q ?? '', locale ?? 'en');
  }

  @Post('pricing/quote')
  @HttpCode(200)
  quote(@Body() body: unknown) {
    const parsed = quoteSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('offer_id and quantity are required');
    }
    return this.pricing.quote(parsed.data.offer_id, toMinor(parsed.data.quantity));
  }
}

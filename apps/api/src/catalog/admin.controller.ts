import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OfferOwnership } from '@prisma/client';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { CatalogService } from './catalog.service';

@Controller('admin/catalog')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class CatalogAdminController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('items')
  @RequirePermissions('catalog:admin')
  items() {
    return this.catalog.adminItems();
  }

  @Get('rules')
  @RequirePermissions('pricing:admin')
  rules() {
    return this.catalog.listRules();
  }

  @Post('brands')
  @RequirePermissions('catalog:admin')
  brand(@Body() body: { slug?: string; name?: string }) {
    if (!body.slug || !body.name) {
      throw Errors.validation('slug and name are required');
    }
    return this.catalog.createBrand({ slug: body.slug, name: body.name });
  }

  @Post('categories')
  @RequirePermissions('catalog:admin')
  category(@Body() body: { slug?: string; name?: string; parent_id?: string }) {
    if (!body.slug || !body.name) {
      throw Errors.validation('slug and name are required');
    }
    return this.catalog.createCategory({ slug: body.slug, name: body.name, parentId: body.parent_id });
  }

  @Post('items')
  @RequirePermissions('catalog:admin')
  createItem(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    if (typeof body['slug'] !== 'string' || typeof body['title'] !== 'string' || typeof body['kind'] !== 'string') {
      throw Errors.validation('slug, kind and title are required');
    }
    return this.catalog.createItem(principal, {
      slug: body['slug'],
      kind: body['kind'] as never,
      brandId: body['brand_id'] as string | undefined,
      categoryId: body['category_id'] as string | undefined,
      createdByOrgId: body['seller_org_id'] as string | undefined,
      title: body['title'],
      description: body['description'] as string | undefined,
      countries: ((body['countries'] as { country_code: string; rx_required?: boolean }[]) ?? []).map((row) => ({
        countryCode: row.country_code,
        rxRequired: row.rx_required,
      })),
    });
  }

  @Post('items/:id/publish')
  @RequirePermissions('catalog:admin')
  publish(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.catalog.publishItem(principal, id);
  }

  @Post('items/:id/variants')
  @RequirePermissions('catalog:admin')
  variant(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { sku_code?: string; pack_size?: string; strength?: string; uom?: string },
  ) {
    if (!body.sku_code || !body.pack_size) {
      throw Errors.validation('sku_code and pack_size are required');
    }
    return this.catalog.addVariant(principal, id, {
      skuCode: body.sku_code,
      packSize: body.pack_size,
      strength: body.strength,
      uom: body.uom,
    });
  }

  @Post('offers')
  @RequirePermissions('catalog:admin')
  offer(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    if (!body['variant_id'] || !body['seller_org_id'] || !body['country_code'] || !body['ownership']) {
      throw Errors.validation('variant_id, seller_org_id, country_code and ownership are required');
    }
    return this.catalog.createOffer(principal, {
      variantId: String(body['variant_id']),
      sellerOrgId: String(body['seller_org_id']),
      countryCode: String(body['country_code']),
      ownership: body['ownership'] as OfferOwnership,
      currency: String(body['currency'] ?? 'USD'),
      costMinor: body['cost_minor'] as string | number,
      listMinor: body['list_minor'] as string | number | null,
      sellMinor: body['sell_minor'] as string | number,
    });
  }

  @Post('rules')
  @RequirePermissions('pricing:admin')
  rule(@CurrentPrincipal() principal: Principal, @Body() body: Record<string, unknown>) {
    return this.catalog.createRule(principal, {
      countryCode: body['country_code'] as string | undefined,
      sellerOrgId: body['seller_org_id'] as string | undefined,
      categoryId: body['category_id'] as string | undefined,
      itemId: body['item_id'] as string | undefined,
      variantId: body['variant_id'] as string | undefined,
      takeBps: body['take_bps'] as number | undefined,
      takeFlatMinor: body['take_flat_minor'] as string | number | undefined,
      priority: body['priority'] as number | undefined,
    });
  }
}

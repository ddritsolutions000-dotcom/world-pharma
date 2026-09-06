import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { OfferOwnership } from '@prisma/client';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { PermissionsGuard } from '../identity/permissions.guard';
import { RequirePermissions } from '../identity/require-permissions';
import { CatalogService } from './catalog.service';
import { OfferReadinessService } from './offer-readiness.service';
import { PharmacyCatalogImportService } from './pharmacy-catalog-import.service';
import { RegulatedClass } from '@prisma/client';
import { isSafeExternalHttpUrl, stripPrototypePollutionKeys } from '../common/url-safety';

@Controller('admin/catalog')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard)
@RequireAudiences('admin')
export class CatalogAdminController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly imports: PharmacyCatalogImportService,
    private readonly readiness: OfferReadinessService,
  ) {}

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
    const countryRows =
      (body['countries'] as { country_code: string; rx_required?: boolean }[] | undefined) ?? [];
    if (!countryRows.length) {
      throw Errors.validation('countries is required with at least one country_code');
    }
    return this.catalog.createItem(principal, {
      slug: body['slug'],
      kind: body['kind'] as never,
      brandId: body['brand_id'] as string | undefined,
      categoryId: body['category_id'] as string | undefined,
      createdByOrgId: body['seller_org_id'] as string | undefined,
      title: body['title'],
      description: body['description'] as string | undefined,
      countries: countryRows.map((row) => ({
        countryCode: row.country_code,
        rxRequired: row.rx_required,
        regulatedClass: (row as { regulated_class?: RegulatedClass }).regulated_class,
        attributes: (row as { attributes?: unknown }).attributes,
      })),
      assets: Array.isArray(body['assets'])
        ? (body['assets'] as { publicUrl?: string; public_url?: string; alt?: string }[])
            .map((row) => ({
              publicUrl: String(row.publicUrl ?? row.public_url ?? ''),
              alt: row.alt,
            }))
            .filter((row) => /^https?:\/\//i.test(row.publicUrl) && isSafeExternalHttpUrl(row.publicUrl))
        : undefined,
    });
  }

  @Patch('items/:id')
  @RequirePermissions('catalog:admin')
  updateItem(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      description?: string;
      country_code?: string;
      attributes?: Record<string, unknown>;
      rx_required?: boolean;
    },
  ) {
    if (!body.title && body.description === undefined && body.attributes === undefined && body.rx_required === undefined) {
      throw Errors.validation('title, description, attributes or rx_required is required');
    }
    return this.catalog.updateItemCopy(principal, id, {
      title: body.title,
      description: body.description,
      countryCode: body.country_code,
      attributes: body.attributes
        ? stripPrototypePollutionKeys(body.attributes)
        : undefined,
      rxRequired: body.rx_required,
    });
  }

  @Post('items/:id/archive')
  @RequirePermissions('catalog:admin')
  archive(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.catalog.archiveItem(principal, id);
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

  @Get('offers/:id/readiness')
  @RequirePermissions('catalog:admin')
  offerReadiness(@Param('id') id: string) {
    return this.readiness.evaluateOffer(id);
  }

  @Get('duplicates')
  @RequirePermissions('catalog:admin')
  duplicates() {
    return this.imports.listDuplicates();
  }

  @Post('duplicates/:id/review')
  @RequirePermissions('catalog:admin')
  reviewDuplicate(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: { status?: 'DISMISSED' | 'CONFIRMED_DISTINCT'; notes?: string },
  ) {
    if (body.status !== 'DISMISSED' && body.status !== 'CONFIRMED_DISTINCT') {
      throw Errors.validation('status must be DISMISSED or CONFIRMED_DISTINCT');
    }
    return this.imports.reviewDuplicate(principal, id, body.status, body.notes);
  }

  @Post('imports')
  @RequirePermissions('catalog:admin')
  importFeed(
    @CurrentPrincipal() principal: Principal,
    @Body()
    body: {
      seller_org_id?: string;
      country_code?: string;
      source_id?: string;
      source_version?: string;
      rows?: Array<{
        source_row_key: string;
        product_id?: string;
        sku?: string;
        price_minor?: number;
        currency?: string;
        stock_qty?: number;
        country_code?: string;
        variant_id?: string;
      }>;
    },
  ) {
    if (!body.seller_org_id || !body.country_code || !body.source_id || !body.source_version) {
      throw Errors.validation('seller_org_id, country_code, source_id and source_version are required');
    }
    return this.imports.importBatch(principal, {
      sellerOrgId: body.seller_org_id,
      countryCode: body.country_code,
      sourceId: body.source_id,
      sourceVersion: body.source_version,
      rows: body.rows ?? [],
    });
  }

  @Get('imports/:id')
  @RequirePermissions('catalog:admin')
  getImport(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.imports.getBatch(principal, id);
  }
}

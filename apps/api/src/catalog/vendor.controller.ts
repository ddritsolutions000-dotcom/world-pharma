import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { OfferOwnership } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { assertVendorSellerAccess } from './access';
import { CatalogService } from './catalog.service';
import { MarketplaceEligibilityService } from './marketplace-eligibility.service';
import { OfferReadinessService } from './offer-readiness.service';
import { PharmacyCatalogImportService } from './pharmacy-catalog-import.service';
import { isSafeExternalHttpUrl } from '../common/url-safety';

const itemSchema = z
  .object({
    slug: z.string().min(2),
    kind: z.enum(['MEDICINE', 'OTC', 'DEVICE', 'CONSUMABLE', 'BUNDLE']),
    brand_id: z.string().uuid().optional(),
    category_id: z.string().uuid().optional(),
    seller_org_id: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().optional(),
    countries: z.array(
      z.object({
        country_code: z.string().length(2),
        available: z.boolean().optional(),
        rx_required: z.boolean().optional(),
        regulated_class: z.enum(['UNCLASSIFIED', 'OTC', 'RX', 'CONTROLLED', 'DEVICE']).optional(),
        attributes: z
          .object({
            manufacturer_name: z.string().optional(),
            composition: z.string().optional(),
            composition_not_applicable: z.boolean().optional(),
            dosage_form: z.string().optional(),
            warnings: z.string().optional(),
            storage: z.string().optional(),
            usage_directions: z.string().optional(),
            country_of_manufacture: z.string().optional(),
          })
          .optional(),
      }),
    ),
    assets: z
      .array(
        z.object({
          public_url: z
            .string()
            .url()
            .refine((u) => isSafeExternalHttpUrl(u), 'unsafe_asset_url'),
          alt: z.string().optional(),
        }),
      )
      .optional(),
  })
  .strict();

const variantSchema = z
  .object({
    sku_code: z.string().min(1),
    pack_size: z.string().min(1),
    strength: z.string().optional(),
    uom: z.string().optional(),
  })
  .strict();

const offerSchema = z
  .object({
    variant_id: z.string().uuid(),
    seller_org_id: z.string().uuid(),
    country_code: z.string().length(2),
    ownership: z.enum(['VENDOR_OWNED', 'MARKETPLACE']),
    location_id: z.string().uuid().optional(),
    currency: z.string().length(3),
    cost_minor: z.union([z.string(), z.number()]),
    list_minor: z.union([z.string(), z.number()]).nullable().optional(),
    sell_minor: z.union([z.string(), z.number()]),
  })
  .strict();

const priceSchema = z
  .object({
    cost_minor: z.union([z.string(), z.number()]),
    list_minor: z.union([z.string(), z.number()]).nullable().optional(),
    sell_minor: z.union([z.string(), z.number()]),
  })
  .strict();

@Controller('vendor/catalog')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class CatalogVendorController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly prisma: PrismaService,
    private readonly marketplace: MarketplaceEligibilityService,
    private readonly readiness: OfferReadinessService,
    private readonly imports: PharmacyCatalogImportService,
  ) {}

  @Get('offers')
  list(@CurrentPrincipal() principal: Principal, @Query('seller_org_id') sellerOrgId: string) {
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required');
    }
    return this.catalog.vendorOffers(principal, sellerOrgId);
  }

  @Get('commercial-rules')
  commercialRules(@CurrentPrincipal() principal: Principal, @Query('seller_org_id') sellerOrgId: string) {
    if (!sellerOrgId) {
      throw Errors.validation('seller_org_id is required');
    }
    return this.catalog.vendorCommercialRules(principal, sellerOrgId);
  }

  @Post('items')
  async createItem(@CurrentPrincipal() principal: Principal, @Body() body: unknown) {
    const parsed = itemSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('Invalid catalog item payload');
    }
    await assertVendorSellerAccess(this.prisma, principal, parsed.data.seller_org_id);
    await this.marketplace.assertCatalogWrite(principal, parsed.data.seller_org_id);
    return this.catalog.createItem(principal, {
      slug: parsed.data.slug,
      kind: parsed.data.kind,
      brandId: parsed.data.brand_id,
      categoryId: parsed.data.category_id,
      createdByOrgId: parsed.data.seller_org_id,
      title: parsed.data.title,
      description: parsed.data.description,
      countries: parsed.data.countries.map((row) => ({
        countryCode: row.country_code,
        available: row.available,
        rxRequired: row.rx_required,
        regulatedClass: row.regulated_class,
        attributes: row.attributes,
      })),
      assets: parsed.data.assets?.map((asset) => ({ publicUrl: asset.public_url, alt: asset.alt })),
    });
  }

  @Post('items/:id/variants')
  addVariant(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: unknown) {
    const parsed = variantSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('sku_code and pack_size are required');
    }
    return this.catalog.addVariant(principal, id, {
      skuCode: parsed.data.sku_code,
      packSize: parsed.data.pack_size,
      strength: parsed.data.strength,
      uom: parsed.data.uom,
    });
  }

  @Post('offers')
  async createOffer(@CurrentPrincipal() principal: Principal, @Body() body: unknown) {
    const parsed = offerSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('Invalid offer payload');
    }
    await assertVendorSellerAccess(this.prisma, principal, parsed.data.seller_org_id);
    await this.marketplace.assertCatalogWrite(principal, parsed.data.seller_org_id);
    return this.catalog.createOffer(principal, {
      variantId: parsed.data.variant_id,
      sellerOrgId: parsed.data.seller_org_id,
      countryCode: parsed.data.country_code,
      ownership: parsed.data.ownership as OfferOwnership,
      locationId: parsed.data.location_id,
      currency: parsed.data.currency,
      costMinor: parsed.data.cost_minor,
      listMinor: parsed.data.list_minor,
      sellMinor: parsed.data.sell_minor,
    });
  }

  @Post('offers/:id/publish')
  async publish(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    const offer = await this.prisma.catalogOffer.findUnique({
      where: { id },
      select: { sellerOrgId: true },
    });
    if (!offer) {
      throw Errors.forbidden('You cannot access this offer.');
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: offer.sellerOrgId },
      select: { kind: true },
    });
    if (!org) {
      throw Errors.forbidden('You cannot access this offer.');
    }
    if (org.kind === 'VENDOR') {
      await this.marketplace.assertCatalogWrite(principal, offer.sellerOrgId);
    }
    return this.catalog.publishOffer(principal, id);
  }

  @Post('offers/:id/prices')
  async price(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: unknown) {
    const parsed = priceSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('cost_minor and sell_minor are required');
    }
    const offer = await this.prisma.catalogOffer.findUnique({
      where: { id },
      select: { sellerOrgId: true },
    });
    if (!offer) {
      throw Errors.forbidden('You cannot access this offer.');
    }
    const org = await this.prisma.organization.findUnique({
      where: { id: offer.sellerOrgId },
      select: { kind: true },
    });
    if (!org) {
      throw Errors.forbidden('You cannot access this offer.');
    }
    if (org.kind === 'VENDOR') {
      await this.marketplace.assertCatalogWrite(principal, offer.sellerOrgId);
    }
    return this.catalog.replacePrice(principal, id, {
      costMinor: parsed.data.cost_minor,
      listMinor: parsed.data.list_minor,
      sellMinor: parsed.data.sell_minor,
    });
  }

  @Get('offers/:id/readiness')
  async offerReadiness(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    const offer = await this.prisma.catalogOffer.findUnique({ where: { id }, select: { sellerOrgId: true } });
    if (!offer) {
      throw Errors.forbidden('You cannot access this offer.');
    }
    await assertVendorSellerAccess(this.prisma, principal, offer.sellerOrgId);
    return this.readiness.evaluateOffer(id);
  }

  @Post('imports')
  async importFeed(
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
    await assertVendorSellerAccess(this.prisma, principal, body.seller_org_id);
    await this.marketplace.assertCatalogWrite(principal, body.seller_org_id);
    return this.imports.importBatch(principal, {
      sellerOrgId: body.seller_org_id,
      countryCode: body.country_code,
      sourceId: body.source_id,
      sourceVersion: body.source_version,
      rows: body.rows ?? [],
    });
  }
}

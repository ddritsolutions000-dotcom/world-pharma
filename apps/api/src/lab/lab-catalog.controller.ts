import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { OfferOwnership } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { CurrentPrincipal, type Principal } from '../identity/current-principal';
import { JwtAuthGuard } from '../identity/jwt.guard';
import { AudienceGuard } from '../identity/audience.guard';
import { RequireAudiences } from '../identity/require-audiences';
import { assertLabOrgAccess } from '../catalog/access';
import { CatalogService } from '../catalog/catalog.service';
import { LabCapabilityService } from './lab-capability.service';

const itemSchema = z
  .object({
    slug: z.string().min(2),
    kind: z.literal('LAB_TEST'),
    brand_id: z.string().uuid().optional(),
    category_id: z.string().uuid().optional(),
    lab_org_id: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().optional(),
    countries: z.array(
      z.object({
        country_code: z.string().length(2),
        available: z.boolean().optional(),
        rx_required: z.boolean().optional(),
      }),
    ),
    assets: z.array(z.object({ public_url: z.string().url(), alt: z.string().optional() })).optional(),
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
    lab_org_id: z.string().uuid(),
    country_code: z.string().length(2),
    ownership: z.literal('LAB_OWNED'),
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

@Controller('lab/catalog')
@UseGuards(JwtAuthGuard, AudienceGuard)
@RequireAudiences('customer', 'partner_applicant')
export class LabCatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly prisma: PrismaService,
    private readonly capabilities: LabCapabilityService,
  ) {}

  @Get('offers')
  list(@CurrentPrincipal() principal: Principal, @Query('lab_org_id') labOrgId: string) {
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    return this.catalog.labOffers(principal, labOrgId);
  }

  @Post('items')
  async createItem(@CurrentPrincipal() principal: Principal, @Body() body: unknown) {
    const parsed = itemSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('Invalid lab catalog item payload (LAB_TEST only).');
    }
    await assertLabOrgAccess(this.prisma, principal, parsed.data.lab_org_id);
    await this.capabilities.assertCatalogWrite(principal, parsed.data.lab_org_id);
    return this.catalog.createItem(principal, {
      slug: parsed.data.slug,
      kind: parsed.data.kind,
      brandId: parsed.data.brand_id,
      categoryId: parsed.data.category_id,
      createdByOrgId: parsed.data.lab_org_id,
      title: parsed.data.title,
      description: parsed.data.description,
      countries: parsed.data.countries.map((row) => ({
        countryCode: row.country_code,
        available: row.available,
        rxRequired: row.rx_required,
      })),
      assets: parsed.data.assets?.map((asset) => ({ publicUrl: asset.public_url, alt: asset.alt })),
    });
  }

  @Post('items/:id/variants')
  async addVariant(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
    @Query('lab_org_id') labOrgId: string,
  ) {
    const parsed = variantSchema.safeParse(body);
    if (!parsed.success) {
      throw Errors.validation('sku_code and pack_size are required');
    }
    if (!labOrgId) {
      throw Errors.validation('lab_org_id is required');
    }
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    await this.capabilities.assertCatalogWrite(principal, labOrgId);
    const item = await this.prisma.catalogItem.findUnique({
      where: { id },
      select: { createdByOrgId: true, kind: true },
    });
    if (!item || item.createdByOrgId !== labOrgId || item.kind !== 'LAB_TEST') {
      throw Errors.forbidden('You cannot modify this catalog item.');
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
      throw Errors.validation('Invalid lab offer payload (LAB_OWNED only).');
    }
    await assertLabOrgAccess(this.prisma, principal, parsed.data.lab_org_id);
    await this.capabilities.assertCatalogWrite(principal, parsed.data.lab_org_id);
    return this.catalog.createOffer(principal, {
      variantId: parsed.data.variant_id,
      sellerOrgId: parsed.data.lab_org_id,
      countryCode: parsed.data.country_code,
      ownership: OfferOwnership.LAB_OWNED,
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
      select: { sellerOrgId: true, ownership: true },
    });
    if (!offer || offer.ownership !== OfferOwnership.LAB_OWNED) {
      throw Errors.forbidden('You cannot access this offer.');
    }
    await this.capabilities.assertCatalogWrite(principal, offer.sellerOrgId);
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
      select: { sellerOrgId: true, ownership: true },
    });
    if (!offer || offer.ownership !== OfferOwnership.LAB_OWNED) {
      throw Errors.forbidden('You cannot access this offer.');
    }
    await this.capabilities.assertCatalogWrite(principal, offer.sellerOrgId);
    return this.catalog.replacePrice(principal, id, {
      costMinor: parsed.data.cost_minor,
      listMinor: parsed.data.list_minor,
      sellMinor: parsed.data.sell_minor,
    });
  }
}

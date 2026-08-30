import { Injectable } from '@nestjs/common';
import {
  CatalogLifecycle,
  CommercialChannel,
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { PolicyResolver } from '../policy/resolver';
import { assertCanManageSeller, assertImagingOrgAccess, assertLabOrgAccess, assertVendorSellerAccess, isPlatformOperator } from './access';
import { minorJson, toMinor } from './money';
import { PricingService } from './pricing.service';
import { CatalogSearchService } from './search.service';
import { InventoryService } from '../inventory/inventory.service';

const itemInclude = {
  brand: true,
  category: true,
  translations: true,
  assets: { orderBy: { sortOrder: 'asc' as const } },
  countries: true,
  variants: {
    include: {
      offers: {
        include: {
          prices: { where: { isCurrent: true } },
          sellerOrg: { select: { id: true, displayName: true } },
        },
      },
    },
  },
} satisfies Prisma.CatalogItemInclude;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly pricing: PricingService,
    private readonly searchIndex: CatalogSearchService,
    private readonly policy: PolicyResolver,
    private readonly inventory: InventoryService,
  ) {}

  async resolveCountry(code: string) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: code.toUpperCase() },
    });
    if (!country) {
      throw Errors.notFound('Country is not available.');
    }
    return country;
  }

  async storefrontFlags(isoAlpha2: string) {
    const resolved = await this.policy.resolvePublished(isoAlpha2);
    const document = resolved?.document ?? null;
    return {
      pharmacy: this.policy.canUseService(document, 'pharmacy'),
      marketplace: this.policy.canUseService(document, 'marketplace'),
      lab:
        this.policy.canUseService(document, 'lab_home') ||
        this.policy.canUseService(document, 'lab_center'),
      imaging: this.policy.canUseService(document, 'imaging_center'),
    };
  }

  async listBrands(countryCode?: string) {
    if (!countryCode) {
      throw Errors.validation('country query parameter is required');
    }
    const country = await this.resolveCountry(countryCode);
    return this.prisma.catalogBrand.findMany({
      where: {
        items: {
          some: {
            status: CatalogLifecycle.PUBLISHED,
            countries: { some: { countryId: country.id, available: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createBrand(input: { slug: string; name: string }) {
    try {
      return await this.prisma.catalogBrand.create({
        data: { id: uuidv7(), slug: input.slug, name: input.name },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.conflict('Brand slug already exists.');
      }
      throw error;
    }
  }

  async listCategories(countryCode?: string) {
    if (!countryCode) {
      throw Errors.validation('country query parameter is required');
    }
    const country = await this.resolveCountry(countryCode);
    return this.prisma.catalogCategory.findMany({
      where: {
        items: {
          some: {
            status: CatalogLifecycle.PUBLISHED,
            countries: { some: { countryId: country.id, available: true } },
          },
        },
      },
      include: { translations: true, children: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createCategory(input: { slug: string; name: string; parentId?: string | null }) {
    const id = uuidv7();
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.catalogCategory.create({
        data: {
          id,
          slug: input.slug,
          name: input.name,
          parentId: input.parentId ?? null,
          translations: { create: [{ id: uuidv7(), locale: 'en', name: input.name }] },
        },
        include: { translations: true },
      });
      await this.outbox.enqueue(tx, {
        type: 'CATEGORY_CHANGED',
        aggregateType: 'CatalogCategory',
        aggregateId: id,
        producer: 'catalog',
        payload: { slug: created.slug },
        occurrenceKey: `create:${id}`,
      });
      return created;
    });
  }

  async createItem(
    principal: Principal,
    input: {
      slug: string;
      kind: Prisma.CatalogItemCreateInput['kind'];
      brandId?: string;
      categoryId?: string;
      createdByOrgId?: string;
      title: string;
      description?: string;
      countries: { countryCode: string; available?: boolean; rxRequired?: boolean }[];
      assets?: { publicUrl: string; alt?: string }[];
    },
  ) {
    if (input.createdByOrgId) {
      await assertCanManageSeller(this.prisma, principal, input.createdByOrgId);
    } else if (!(await isPlatformOperator(this.prisma, principal.personId))) {
      throw Errors.forbidden();
    }
    const countries = await Promise.all(
      input.countries.map(async (row) => ({
        ...row,
        country: await this.resolveCountry(row.countryCode),
      })),
    );
    const id = uuidv7();
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.catalogItem.create({
        data: {
          id,
          slug: input.slug,
          kind: input.kind,
          status: CatalogLifecycle.DRAFT,
          brandId: input.brandId,
          categoryId: input.categoryId,
          createdByOrgId: input.createdByOrgId,
          translations: {
            create: [{ id: uuidv7(), locale: 'en', title: input.title, description: input.description ?? '' }],
          },
          countries: {
            create: countries.map((row) => ({
              id: uuidv7(),
              countryId: row.country.id,
              available: row.available ?? true,
              rxRequired: row.rxRequired ?? false,
              complianceNote: 'LEGAL/COMPLIANCE REVIEW REQUIRED',
            })),
          },
          assets: {
            create: (input.assets ?? []).map((asset, index) => ({
              id: uuidv7(),
              storageKey: asset.publicUrl,
              publicUrl: asset.publicUrl,
              alt: asset.alt ?? '',
              sortOrder: index,
            })),
          },
        },
        include: itemInclude,
      });
      await this.outbox.enqueue(tx, {
        type: 'PRODUCT_CREATED',
        aggregateType: 'CatalogItem',
        aggregateId: id,
        producer: 'catalog',
        payload: { slug: created.slug },
        occurrenceKey: `create:${id}`,
        actorId: principal.personId,
      });
      return created;
    });
    for (const row of countries) {
      await this.searchIndex.reindexItem(id, row.country.id);
    }
    return item;
  }

  async publishItem(principal: Principal, itemId: string) {
    if (!(await isPlatformOperator(this.prisma, principal.personId))) {
      throw Errors.forbidden('Only platform operators can publish catalog items.');
    }
    const item = await this.prisma.catalogItem.findUnique({
      where: { id: itemId },
      include: { countries: true },
    });
    if (!item) {
      throw Errors.notFound('Catalog item not found.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.catalogItem.update({
        where: { id: itemId },
        data: { status: CatalogLifecycle.PUBLISHED, publishedAt: new Date() },
        include: itemInclude,
      });
      await this.outbox.enqueue(tx, {
        type: 'PRODUCT_PUBLISHED',
        aggregateType: 'CatalogItem',
        aggregateId: itemId,
        producer: 'catalog',
        payload: { slug: row.slug },
        occurrenceKey: `publish:${itemId}`,
        actorId: principal.personId,
      });
      return row;
    });
    for (const country of item.countries) {
      await this.searchIndex.reindexItem(itemId, country.countryId);
    }
    return updated;
  }

  async addVariant(
    principal: Principal,
    itemId: string,
    input: { skuCode: string; packSize: string; strength?: string; uom?: string },
  ) {
    const item = await this.prisma.catalogItem.findUnique({ where: { id: itemId } });
    if (!item) {
      throw Errors.notFound('Catalog item not found.');
    }
    if (item.createdByOrgId) {
      await assertCanManageSeller(this.prisma, principal, item.createdByOrgId);
    } else if (!(await isPlatformOperator(this.prisma, principal.personId))) {
      throw Errors.forbidden();
    }
    try {
      return await this.prisma.catalogVariant.create({
        data: {
          id: uuidv7(),
          itemId,
          skuCode: input.skuCode,
          packSize: input.packSize,
          strength: input.strength,
          uom: input.uom ?? 'each',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.conflict('SKU code already exists.');
      }
      throw error;
    }
  }

  async createOffer(
    principal: Principal,
    input: {
      variantId: string;
      sellerOrgId: string;
      countryCode: string;
      ownership: OfferOwnership;
      locationId?: string;
      currency: string;
      costMinor: string | number;
      listMinor?: string | number | null;
      sellMinor: string | number;
    },
  ) {
    await assertCanManageSeller(this.prisma, principal, input.sellerOrgId);
    const org = await this.prisma.organization.findUnique({ where: { id: input.sellerOrgId } });
    if (!org) {
      throw Errors.notFound('Seller organization not found.');
    }
    this.assertOwnership(input.ownership, org.kind);
    const country = await this.resolveCountry(input.countryCode);
    const variant = await this.prisma.catalogVariant.findUnique({ where: { id: input.variantId } });
    if (!variant) {
      throw Errors.notFound('Variant not found.');
    }
    const id = uuidv7();
    await this.prisma.$transaction(async (tx) => {
      await tx.catalogOffer.create({
        data: {
          id,
          variantId: input.variantId,
          sellerOrgId: input.sellerOrgId,
          countryId: country.id,
          locationId: input.locationId,
          ownership: input.ownership,
          status: OfferStatus.DRAFT,
          currency: input.currency.toUpperCase(),
        },
      });
      await this.pricing.createVersion(tx, {
        offerId: id,
        currency: input.currency.toUpperCase(),
        costMinor: toMinor(input.costMinor),
        listMinor: input.listMinor === undefined || input.listMinor === null ? null : toMinor(input.listMinor),
        sellMinor: toMinor(input.sellMinor),
        validFrom: new Date(),
        validTo: null,
      });
      await this.outbox.enqueue(tx, {
        type: 'OFFER_CREATED',
        aggregateType: 'CatalogOffer',
        aggregateId: id,
        producer: 'catalog',
        countryId: country.id,
        payload: { seller_org_id: input.sellerOrgId, ownership: input.ownership },
        occurrenceKey: `create:${id}`,
        actorId: principal.personId,
      });
    });
    await this.searchIndex.reindexItem(variant.itemId, country.id);
    return this.prisma.catalogOffer.findUniqueOrThrow({
      where: { id },
      include: { prices: true, variant: true },
    });
  }

  async publishOffer(principal: Principal, offerId: string) {
    const offer = await this.prisma.catalogOffer.findUnique({
      where: { id: offerId },
      include: { variant: true },
    });
    if (!offer) {
      throw Errors.notFound('Offer not found.');
    }
    await assertCanManageSeller(this.prisma, principal, offer.sellerOrgId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.catalogOffer.update({
        where: { id: offerId },
        data: { status: OfferStatus.PUBLISHED, publishedAt: new Date() },
        include: { variant: true, prices: { where: { isCurrent: true } } },
      });
      await this.outbox.enqueue(tx, {
        type: 'OFFER_UPDATED',
        aggregateType: 'CatalogOffer',
        aggregateId: offerId,
        producer: 'catalog',
        countryId: offer.countryId,
        payload: { status: 'PUBLISHED' },
        occurrenceKey: `publish:${offerId}`,
        actorId: principal.personId,
      });
      return row;
    });
    await this.searchIndex.reindexItem(offer.variant.itemId, offer.countryId);
    return updated;
  }

  async replacePrice(
    principal: Principal,
    offerId: string,
    input: { costMinor: string | number; listMinor?: string | number | null; sellMinor: string | number },
  ) {
    const offer = await this.prisma.catalogOffer.findUnique({
      where: { id: offerId },
      include: { variant: true },
    });
    if (!offer) {
      throw Errors.notFound('Offer not found.');
    }
    await assertCanManageSeller(this.prisma, principal, offer.sellerOrgId);
    const version = await this.prisma.$transaction(async (tx) => {
      const row = await this.pricing.createVersion(tx, {
        offerId,
        currency: offer.currency,
        costMinor: toMinor(input.costMinor),
        listMinor: input.listMinor === undefined || input.listMinor === null ? null : toMinor(input.listMinor),
        sellMinor: toMinor(input.sellMinor),
        validFrom: new Date(),
        validTo: null,
      });
      await this.outbox.enqueue(tx, {
        type: 'PRICE_CHANGED',
        aggregateType: 'CatalogOffer',
        aggregateId: offerId,
        producer: 'catalog',
        countryId: offer.countryId,
        payload: { price_version: row.version, sell_minor: minorJson(row.sellMinor), currency: row.currency },
        occurrenceKey: `price:${offerId}:${row.version}`,
        actorId: principal.personId,
      });
      return row;
    });
    await this.searchIndex.reindexItem(offer.variant.itemId, offer.countryId);
    return version;
  }

  async createRule(
    principal: Principal,
    input: {
      countryCode?: string;
      sellerOrgId?: string;
      categoryId?: string;
      itemId?: string;
      variantId?: string;
      channel?: CommercialChannel;
      takeBps?: number;
      takeFlatMinor?: string | number;
      priority?: number;
    },
  ) {
    if (!(await isPlatformOperator(this.prisma, principal.personId))) {
      throw Errors.forbidden('Only platform operators can manage commercial rules.');
    }
    const country = input.countryCode ? await this.resolveCountry(input.countryCode) : null;
    return this.prisma.commercialRule.create({
      data: {
        id: uuidv7(),
        countryId: country?.id,
        sellerOrgId: input.sellerOrgId,
        categoryId: input.categoryId,
        itemId: input.itemId,
        variantId: input.variantId,
        channel: input.channel,
        takeBps: input.takeBps ?? 0,
        takeFlatMinor: input.takeFlatMinor === undefined ? 0n : toMinor(input.takeFlatMinor),
        priority: input.priority ?? 0,
        validFrom: new Date(),
      },
    });
  }

  async customerBrowse(
    countryCode: string,
    query?: { q?: string; category?: string; cursor?: string; limit?: number; locale?: string },
  ) {
    const country = await this.resolveCountry(countryCode);
    const locale = query?.locale?.trim() || country.defaultLocale || 'en';
    const cacheKey = `catalog:browse:${country.id}:${locale}:${query?.q ?? ''}:${query?.category ?? ''}:${query?.cursor ?? ''}`;
    const cached = await this.searchIndex.readBrowseCache(cacheKey);
    if (cached) {
      return cached;
    }
    const flags = await this.storefrontFlags(country.isoAlpha2);
    const allowed = this.allowedOwnership(flags);
    if (!allowed.length) {
      return { country_enabled: false, data: [], next_cursor: null };
    }
    const limit = Math.min(query?.limit ?? 24, 50);
    const rows = await this.prisma.catalogItem.findMany({
      where: {
        status: CatalogLifecycle.PUBLISHED,
        countries: { some: { countryId: country.id, available: true } },
        variants: {
          some: {
            offers: { some: { countryId: country.id, status: OfferStatus.PUBLISHED, ownership: { in: allowed } } },
          },
        },
        ...(query?.category ? { category: { slug: query.category } } : {}),
        ...(query?.q
          ? {
              OR: [
                { slug: { contains: query.q, mode: 'insensitive' } },
                { translations: { some: { title: { contains: query.q, mode: 'insensitive' } } } },
                { variants: { some: { skuCode: { contains: query.q, mode: 'insensitive' } } } },
                { brand: { name: { contains: query.q, mode: 'insensitive' } } },
              ],
            }
          : {}),
        ...(query?.cursor ? { id: { gt: query.cursor } } : {}),
      },
      include: itemInclude,
      take: limit + 1,
      orderBy: { id: 'asc' },
    });
    const page = rows.slice(0, limit);
    const result = {
      country_enabled: true,
      data: await this.withAvailability(country.id, page.map((item) => this.toPublicItem(item, country.id, allowed))),
      next_cursor: rows.length > limit ? page[page.length - 1]?.id ?? null : null,
    };
    await this.searchIndex.writeBrowseCache(cacheKey, result);
    return result;
  }

  async customerItem(countryCode: string, slug: string) {
    const country = await this.resolveCountry(countryCode);
    const flags = await this.storefrontFlags(country.isoAlpha2);
    const allowed = this.allowedOwnership(flags);
    if (!allowed.length) {
      throw Errors.notFound('Catalog is not enabled in this country.');
    }
    const item = await this.prisma.catalogItem.findFirst({
      where: { slug, status: CatalogLifecycle.PUBLISHED },
      include: itemInclude,
    });
    if (!item) {
      throw Errors.notFound('Product not found.');
    }
    const mapped = this.toPublicItem(item, country.id, allowed);
    if (!mapped.offers.length) {
      throw Errors.notFound('Product not found.');
    }
    const [withStock] = await this.withAvailability(country.id, [mapped]);
    return withStock;
  }

  async search(countryCode: string, q: string, locale = 'en') {
    const country = await this.resolveCountry(countryCode);
    const flags = await this.storefrontFlags(country.isoAlpha2);
    if (!flags.pharmacy && !flags.marketplace && !flags.lab) {
      return { country_enabled: false, data: [] };
    }
    return {
      country_enabled: true,
      data: await this.searchIndex.search(country.id, q, locale),
    };
  }

  async vendorOffers(principal: Principal, sellerOrgId: string) {
    await assertVendorSellerAccess(this.prisma, principal, sellerOrgId);
    return this.listSellerOffers(sellerOrgId);
  }

  /** Lab-scoped offer list — same catalog kernel presenter; LAB org access only. */
  async labOffers(principal: Principal, labOrgId: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    return this.listSellerOffers(labOrgId);
  }

  /** Imaging-scoped offer list — same catalog kernel; IMAGING_CENTER org access only. */
  async imagingOffers(principal: Principal, imagingOrgId: string) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    return this.listSellerOffers(imagingOrgId);
  }

  private async listSellerOffers(sellerOrgId: string) {
    const rows = await this.prisma.catalogOffer.findMany({
      where: { sellerOrgId },
      include: {
        country: { select: { isoAlpha2: true } },
        variant: { include: { item: { include: { translations: true } } } },
        prices: { where: { isCurrent: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { data: rows.map((row) => this.presentVendorOffer(row)) };
  }

  /**
   * Vendor-safe commercial rule visibility: own seller-scoped rules +
   * marketplace/country defaults that can apply to this seller. Never other sellers.
   */
  async vendorCommercialRules(principal: Principal, sellerOrgId: string) {
    await assertVendorSellerAccess(this.prisma, principal, sellerOrgId);
    const org = await this.prisma.organization.findUnique({
      where: { id: sellerOrgId },
      select: { id: true, countryId: true, country: { select: { isoAlpha2: true } } },
    });
    if (!org) {
      throw Errors.notFound('Seller organization not found.');
    }
    const now = new Date();
    const rows = await this.prisma.commercialRule.findMany({
      where: {
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gt: now } }],
        AND: [
          { OR: [{ countryId: null }, { countryId: org.countryId }] },
          {
            OR: [
              { sellerOrgId },
              {
                sellerOrgId: null,
                OR: [{ channel: null }, { channel: CommercialChannel.MARKETPLACE }],
              },
            ],
          },
        ],
      },
      include: { country: { select: { isoAlpha2: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        country_code: row.country?.isoAlpha2 ?? null,
        seller_org_id: row.sellerOrgId,
        channel: row.channel,
        take_bps: row.takeBps,
        take_flat_minor: minorJson(row.takeFlatMinor),
        priority: row.priority,
        valid_from: row.validFrom.toISOString(),
        valid_to: row.validTo?.toISOString() ?? null,
        scope: row.sellerOrgId ? 'seller' : row.countryId ? 'country' : 'global',
      })),
      seller_org_id: sellerOrgId,
      country_code: org.country.isoAlpha2,
      note: 'Effective take is resolved per offer at quote time. Historical orders keep frozen commercial facts.',
    };
  }

  private presentVendorOffer(
    offer: Prisma.CatalogOfferGetPayload<{
      include: {
        country: { select: { isoAlpha2: true } };
        variant: { include: { item: { include: { translations: true } } } };
        prices: true;
      };
    }>,
  ) {
    const price = offer.prices[0];
    const title = offer.variant.item.translations[0]?.title ?? offer.variant.item.slug;
    return {
      id: offer.id,
      variant_id: offer.variantId,
      seller_org_id: offer.sellerOrgId,
      country_code: offer.country.isoAlpha2,
      currency: offer.currency,
      ownership: offer.ownership,
      status: offer.status,
      location_id: offer.locationId,
      sku: offer.variant.skuCode,
      title,
      sell_minor: price ? minorJson(price.sellMinor) : null,
      list_minor: price && price.listMinor !== null ? minorJson(price.listMinor) : null,
      cost_minor: price ? minorJson(price.costMinor) : null,
      price_version: price?.version ?? null,
    };
  }

  adminItems() {
    return this.prisma.catalogItem.findMany({
      include: itemInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  listRules() {
    return this.prisma.commercialRule.findMany({ orderBy: { priority: 'desc' } });
  }

  private allowedOwnership(flags: {
    pharmacy: boolean;
    marketplace: boolean;
    lab: boolean;
    imaging: boolean;
  }): OfferOwnership[] {
    const allowed: OfferOwnership[] = [];
    if (flags.pharmacy) {
      allowed.push(OfferOwnership.PLATFORM_OWNED);
    }
    if (flags.marketplace) {
      allowed.push(OfferOwnership.VENDOR_OWNED, OfferOwnership.MARKETPLACE);
    }
    if (flags.lab) {
      allowed.push(OfferOwnership.LAB_OWNED);
    }
    if (flags.imaging) {
      allowed.push(OfferOwnership.IMAGING_OWNED);
    }
    return allowed;
  }

  private assertOwnership(ownership: OfferOwnership, kind: OrganizationKind): void {
    if (ownership === OfferOwnership.PLATFORM_OWNED) {
      if (kind !== OrganizationKind.PLATFORM && kind !== OrganizationKind.PHARMACY_OWNED) {
        throw Errors.validation('PLATFORM_OWNED offers require a platform or owned-pharmacy organization.');
      }
    }
    if (ownership === OfferOwnership.VENDOR_OWNED || ownership === OfferOwnership.MARKETPLACE) {
      if (kind !== OrganizationKind.VENDOR) {
        throw Errors.validation('Vendor/marketplace offers require a vendor organization.');
      }
    }
    if (ownership === OfferOwnership.LAB_OWNED) {
      if (kind !== OrganizationKind.LAB) {
        throw Errors.validation('LAB_OWNED offers require a laboratory organization.');
      }
    }
    if (ownership === OfferOwnership.IMAGING_OWNED) {
      if (kind !== OrganizationKind.IMAGING_CENTER) {
        throw Errors.validation('IMAGING_OWNED offers require an imaging center organization.');
      }
    }
  }

  private toPublicItem(
    item: Prisma.CatalogItemGetPayload<{ include: typeof itemInclude }>,
    countryId: string,
    allowedOwnership: OfferOwnership[],
  ) {
    const assortment = item.countries.find((row) => row.countryId === countryId);
    const translation = item.translations[0];
    const offers = item.variants.flatMap((variant) =>
      variant.offers
        .filter((offer) => offer.countryId === countryId && offer.status === OfferStatus.PUBLISHED)
        .filter((offer) => allowedOwnership.includes(offer.ownership))
        .map((offer) => {
          const price = offer.prices[0];
          return {
            id: offer.id,
            seller_org_id: offer.sellerOrgId,
            seller_display_name: offer.sellerOrg.displayName,
            ownership: offer.ownership,
            currency: offer.currency,
            sku: variant.skuCode,
            pack_size: variant.packSize,
            price: price
              ? {
                  sell_minor: minorJson(price.sellMinor),
                  list_minor: price.listMinor === null ? null : minorJson(price.listMinor),
                  version: price.version,
                }
              : null,
          };
        }),
    );
    return {
      id: item.id,
      slug: item.slug,
      kind: item.kind,
      brand: item.brand?.name ?? null,
      category: item.category?.name ?? null,
      title: translation?.title ?? item.slug,
      description: translation?.description ?? '',
      assets: item.assets.map((asset) => ({ url: asset.publicUrl, alt: asset.alt })),
      regulated_class: assortment?.regulatedClass ?? 'UNCLASSIFIED',
      rx_required: assortment?.rxRequired ?? false,
      availability: assortment?.available ? 'listed' : 'unavailable',
      inventory: { available: false },
      offers,
    };
  }

  private async withAvailability<T extends { kind?: string; offers: { seller_org_id: string; sku: string }[] }>(
    countryId: string,
    items: T[],
  ): Promise<(T & { inventory: { available: boolean } })[]> {
    const commerceItems = items.filter((item) => item.kind !== 'LAB_TEST' && item.kind !== 'IMAGING_STUDY');
    const pairs = commerceItems.flatMap((item) =>
      item.offers.map((offer) => ({
        sku: offer.sku,
        sellerOrgId: offer.seller_org_id,
      })),
    );
    const variants = await this.prisma.catalogVariant.findMany({
      where: { skuCode: { in: [...new Set(pairs.map((row) => row.sku))] } },
      select: { id: true, skuCode: true },
    });
    const skuToId = new Map(variants.map((row) => [row.skuCode, row.id]));
    const offers = pairs
      .map((row) => {
        const variantId = skuToId.get(row.sku);
        return variantId ? { variantId, sellerOrgId: row.sellerOrgId } : null;
      })
      .filter((row): row is { variantId: string; sellerOrgId: string } => row !== null);
    const inStock = offers.length
      ? await this.inventory.availabilityForOffers(countryId, offers)
      : new Set<string>();
    const skus = new Set(
      variants.filter((row) => inStock.has(row.id)).map((row) => row.skuCode),
    );
    return items.map((item) => ({
      ...item,
      inventory: {
        available:
          item.kind === 'LAB_TEST' || item.kind === 'IMAGING_STUDY'
            ? item.offers.length > 0
            : item.offers.some((offer) => skus.has(offer.sku)),
      },
    }));
  }
}

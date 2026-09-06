import { Injectable } from '@nestjs/common';
import {
  CatalogLifecycle,
  CommercialChannel,
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  Prisma,
  ProductDuplicateStatus,
  RegulatedClass,
} from '@prisma/client';
import { uuidv7, parseCatalogAttributes, sanitizeCatalogAttributes } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { PolicyResolver } from '../policy/resolver';
import { assertCanManageSeller, assertImagingOrgAccess, assertLabOrgAccess, assertVendorSellerAccess, isPlatformOperator } from './access';
import { minorJson, toMinor } from './money';
import { PricingService } from './pricing.service';
import { CatalogSearchService, type CatalogSearchSort } from './search.service';
import { InventoryService } from '../inventory/inventory.service';
import { MarketplaceEligibilityService } from './marketplace-eligibility.service';
import { resolveServiceability } from '../logistics/serviceability';
import { OfferReadinessService } from './offer-readiness.service';
import { evaluatePossibleDuplicate } from './catalog-duplicate';

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
    private readonly marketplace: MarketplaceEligibilityService,
    private readonly offerReadiness: OfferReadinessService,
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
      countries: { countryCode: string; available?: boolean; rxRequired?: boolean; attributes?: unknown; regulatedClass?: RegulatedClass }[];
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
              regulatedClass: row.regulatedClass ?? (row.rxRequired ? RegulatedClass.RX : RegulatedClass.UNCLASSIFIED),
              attributes: sanitizeCatalogAttributes(row.attributes ?? {}) as Prisma.InputJsonValue,
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
      await this.recordPossibleDuplicates(id, row.country.id);
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
    await this.ensureStorefrontOffer(itemId);
    return updated;
  }

  async updateItemCopy(
    principal: Principal,
    itemId: string,
    input: {
      title?: string;
      description?: string;
      countryCode?: string;
      attributes?: unknown;
      rxRequired?: boolean;
    },
  ) {
    if (!(await isPlatformOperator(this.prisma, principal.personId))) {
      throw Errors.forbidden('Only platform operators can edit catalog copy.');
    }
    const item = await this.prisma.catalogItem.findUnique({
      where: { id: itemId },
      include: { translations: true, countries: true },
    });
    if (!item) {
      throw Errors.notFound('Catalog item not found.');
    }
    const en = item.translations.find((row) => row.locale === 'en') ?? item.translations[0];
    if (!en) {
      throw Errors.validation('Item has no translation to edit.');
    }
    await this.prisma.catalogItemI18n.update({
      where: { id: en.id },
      data: {
        title: input.title?.trim() || en.title,
        description: input.description !== undefined ? input.description : en.description,
      },
    });
    if (input.attributes !== undefined || input.rxRequired !== undefined) {
      let countryId = item.countries[0]?.countryId;
      if (input.countryCode) {
        countryId = (await this.resolveCountry(input.countryCode)).id;
      }
      const row = item.countries.find((entry) => entry.countryId === countryId);
      if (!row) {
        throw Errors.validation('Item is not available in this country.');
      }
      const nextAttributes =
        input.attributes !== undefined
          ? sanitizeCatalogAttributes(input.attributes)
          : parseCatalogAttributes(row.attributes);
      await this.prisma.catalogItemCountry.update({
        where: { id: row.id },
        data: {
          attributes: nextAttributes as Prisma.InputJsonValue,
          rxRequired: input.rxRequired !== undefined ? input.rxRequired : row.rxRequired,
        },
      });
    }
    const updated = await this.prisma.catalogItem.findUniqueOrThrow({
      where: { id: itemId },
      include: itemInclude,
    });
    for (const country of item.countries) {
      await this.searchIndex.reindexItem(itemId, country.countryId);
    }
    return updated;
  }

  async archiveItem(principal: Principal, itemId: string) {
    if (!(await isPlatformOperator(this.prisma, principal.personId))) {
      throw Errors.forbidden('Only platform operators can archive catalog items.');
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
        data: { status: CatalogLifecycle.ARCHIVED },
        include: itemInclude,
      });
      await this.outbox.enqueue(tx, {
        type: 'PRODUCT_ARCHIVED',
        aggregateType: 'CatalogItem',
        aggregateId: itemId,
        producer: 'catalog',
        payload: { slug: row.slug },
        occurrenceKey: `archive:${itemId}`,
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
      const created = await this.prisma.catalogVariant.create({
        data: {
          id: uuidv7(),
          itemId,
          skuCode: input.skuCode,
          packSize: input.packSize,
          strength: input.strength,
          uom: input.uom ?? 'each',
        },
      });
      const countries = await this.prisma.catalogItemCountry.findMany({ where: { itemId } });
      for (const country of countries) {
        await this.recordPossibleDuplicates(itemId, country.countryId);
      }
      return created;
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
    const expectedCurrency = country.defaultCurrency.toUpperCase();
    if (input.currency.toUpperCase() !== expectedCurrency) {
      throw Errors.problem(
        422,
        'CURRENCY_MISMATCH',
        'Currency mismatch',
        `Offer currency must match country configuration (${expectedCurrency}).`,
      );
    }
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
      include: { variant: { include: { item: true } } },
    });
    if (!offer) {
      throw Errors.notFound('Offer not found.');
    }
    await assertCanManageSeller(this.prisma, principal, offer.sellerOrgId);
    const quality = await this.offerReadiness.evaluateOffer(offerId);
    const itemKind = offer.variant.item.kind;
    const blocking =
      itemKind === 'MEDICINE'
        ? quality.blockers
        : quality.blockers.filter((code) =>
            [
              'PRODUCT_NAME_MISSING',
              'SKU_MISSING',
              'PACK_SIZE_MISSING',
              'PRICE_MISSING',
              'CURRENCY_MISSING',
              'CURRENCY_MISMATCH',
              'SELLER_MISSING',
            ].includes(code),
          );
    if (blocking.length > 0) {
      throw Errors.problem(422, 'OFFER_NOT_PUBLISHABLE', 'Offer is not publishable', blocking.join(','));
    }
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
    query?: {
      q?: string;
      category?: string;
      brand?: string;
      manufacturer?: string;
      rx?: boolean;
      in_stock?: boolean;
      sort?: CatalogSearchSort;
      cursor?: string;
      limit?: number;
      locale?: string;
    },
  ) {
    const country = await this.resolveCountry(countryCode);
    const locale = query?.locale?.trim() || country.defaultLocale || 'en';
    const cacheKey = `catalog:browse:${country.id}:${locale}:${JSON.stringify(query ?? {})}`;
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

    if (query?.q?.trim()) {
      const searchPage = await this.searchIndex.searchPage(
        country.id,
        query.q,
        locale,
        limit,
        {
          brand: query.brand,
          category: query.category,
          manufacturer: query.manufacturer,
          rx: query.rx,
          in_stock: query.in_stock,
        },
        query.sort ?? 'relevance',
        query.cursor,
      );
      if (!searchPage.data.length) {
        const empty = { country_enabled: true, data: [], next_cursor: null };
        await this.searchIndex.writeBrowseCache(cacheKey, empty);
        return empty;
      }
      const itemIds = searchPage.data.map((row) => row.itemId);
      const rows = await this.prisma.catalogItem.findMany({
        where: {
          id: { in: itemIds },
          status: CatalogLifecycle.PUBLISHED,
          countries: { some: { countryId: country.id, available: true } },
        },
        include: itemInclude,
      });
      const order = new Map(itemIds.map((id, index) => [id, index]));
      rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      const mapped = rows.map((item) => this.toPublicItem(item, country.id, allowed));
      const eligibleMapped = await this.filterMarketplaceEligibleOffers(mapped);
      const result = {
        country_enabled: true,
        data: await this.withAvailability(country.id, eligibleMapped),
        next_cursor: searchPage.next_cursor,
      };
      await this.searchIndex.writeBrowseCache(cacheKey, result);
      return result;
    }

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
        ...(query?.cursor ? { id: { gt: query.cursor } } : {}),
      },
      include: itemInclude,
      take: limit + 1,
      orderBy: { id: 'asc' },
    });
    const page = rows.slice(0, limit);
    const mapped = page.map((item) => this.toPublicItem(item, country.id, allowed));
    const eligibleMapped = await this.filterMarketplaceEligibleOffers(mapped);
    const result = {
      country_enabled: true,
      data: await this.withAvailability(country.id, eligibleMapped),
      next_cursor: rows.length > limit ? page[page.length - 1]?.id ?? null : null,
    };
    await this.searchIndex.writeBrowseCache(cacheKey, result);
    return result;
  }

  async customerItem(countryCode: string, slug: string, postalCode?: string) {
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
    const visibleOffers = [];
    for (const offer of mapped.offers) {
      if (
        offer.ownership === OfferOwnership.VENDOR_OWNED ||
        offer.ownership === OfferOwnership.MARKETPLACE
      ) {
        if (await this.marketplace.isCustomerPurchasableSeller(offer.seller_org_id)) {
          visibleOffers.push(offer);
        }
        continue;
      }
      visibleOffers.push(offer);
    }
    if (!visibleOffers.length) {
      throw Errors.notFound('Product not found.');
    }
    const [withStock] = await this.withAvailability(country.id, [{ ...mapped, offers: visibleOffers }]);
    const reviewAgg = await this.prisma.productReview.aggregate({
      where: { countryId: country.id, catalogItemId: item.id, status: 'APPROVED' },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const serviceability = postalCode?.trim()
      ? resolveServiceability(country.isoAlpha2, postalCode.trim())
      : null;
    return {
      ...withStock,
      review_summary: {
        avg_rating: reviewAgg._avg.rating,
        review_count: reviewAgg._count.rating,
      },
      serviceability: serviceability
        ? {
            ...serviceability,
            purchasable:
              serviceability.medicine_delivery &&
              withStock.inventory.available &&
              withStock.offers.some((offer) => (offer as { inventory?: { available?: boolean } }).inventory?.available),
          }
        : null,
    };
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
    const data = await Promise.all(
      rows.map(async (row) => {
        const presented = this.presentVendorOffer(row);
        const quality = await this.offerReadiness.evaluateOffer(row.id);
        return {
          ...presented,
          catalog_ready: quality.catalog_ready,
          inventory_ready: quality.inventory_ready,
          blockers: quality.blockers,
        };
      }),
    );
    return { data };
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

  private async recordPossibleDuplicates(itemId: string, countryId: string): Promise<void> {
    const item = await this.prisma.catalogItem.findUnique({
      where: { id: itemId },
      include: {
        translations: true,
        brand: true,
        countries: true,
        variants: true,
      },
    });
    if (!item) {
      return;
    }
    const countryRow = item.countries.find((row) => row.countryId === countryId);
    const attrs = parseCatalogAttributes(countryRow?.attributes ?? {});
    const incoming = {
      title: item.translations[0]?.title ?? null,
      manufacturer: attrs.manufacturer_name ?? item.brand?.name ?? null,
      composition: attrs.composition ?? null,
      strength: item.variants[0]?.strength ?? null,
      packSize: item.variants[0]?.packSize ?? null,
      sku: item.variants[0]?.skuCode ?? null,
    };
    const others = await this.prisma.catalogItem.findMany({
      where: {
        id: { not: itemId },
        countries: { some: { countryId } },
      },
      include: {
        translations: true,
        brand: true,
        countries: true,
        variants: true,
      },
      take: 200,
    });
    for (const other of others) {
      const otherAttrs = parseCatalogAttributes(
        other.countries.find((row) => row.countryId === countryId)?.attributes ?? {},
      );
      const result = evaluatePossibleDuplicate(incoming, {
        title: other.translations[0]?.title ?? null,
        manufacturer: otherAttrs.manufacturer_name ?? other.brand?.name ?? null,
        composition: otherAttrs.composition ?? null,
        strength: other.variants[0]?.strength ?? null,
        packSize: other.variants[0]?.packSize ?? null,
        sku: other.variants[0]?.skuCode ?? null,
      });
      if (!result.possible) {
        continue;
      }
      await this.prisma.productDuplicateCandidate.upsert({
        where: { itemId_matchItemId: { itemId, matchItemId: other.id } },
        update: { matchKeys: result.match_keys, status: ProductDuplicateStatus.POSSIBLE_DUPLICATE },
        create: {
          id: uuidv7(),
          countryId,
          itemId,
          matchItemId: other.id,
          matchKeys: result.match_keys,
          status: ProductDuplicateStatus.POSSIBLE_DUPLICATE,
        },
      });
    }
  }

  private async resolveSellerForCountry(countryId: string): Promise<{
    orgId: string;
    ownership: OfferOwnership;
  } | null> {
    const owned = await this.prisma.organization.findFirst({
      where: { countryId, kind: { in: [OrganizationKind.PLATFORM, OrganizationKind.PHARMACY_OWNED] } },
      orderBy: { createdAt: 'asc' },
    });
    if (owned) {
      return { orgId: owned.id, ownership: OfferOwnership.PLATFORM_OWNED };
    }
    const vendor = await this.prisma.organization.findFirst({
      where: { countryId, kind: OrganizationKind.VENDOR },
      orderBy: { createdAt: 'asc' },
    });
    if (vendor) {
      return { orgId: vendor.id, ownership: OfferOwnership.VENDOR_OWNED };
    }
    return null;
  }

  private async ensureStorefrontOffer(itemId: string): Promise<void> {
    const item = await this.prisma.catalogItem.findUnique({
      where: { id: itemId },
      include: {
        countries: { include: { country: true } },
        variants: { include: { offers: true } },
      },
    });
    if (!item) {
      return;
    }
    let variantId = item.variants[0]?.id;
    if (!variantId) {
      const created = await this.prisma.catalogVariant.create({
        data: {
          id: uuidv7(),
          itemId,
          skuCode: `SKU-${item.slug}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || uuidv7().slice(0, 12),
          packSize: '1',
          uom: 'each',
        },
      });
      variantId = created.id;
    }
    const variant = await this.prisma.catalogVariant.findUniqueOrThrow({
      where: { id: variantId },
      include: { offers: true },
    });
    for (const row of item.countries) {
      const existing = variant.offers.find((offer) => offer.countryId === row.countryId);
      if (existing) {
        if (existing.status !== OfferStatus.PUBLISHED) {
          await this.prisma.catalogOffer.update({
            where: { id: existing.id },
            data: { status: OfferStatus.PUBLISHED, publishedAt: new Date() },
          });
        }
        continue;
      }
      const seller = await this.resolveSellerForCountry(row.countryId);
      if (!seller) {
        continue;
      }
      const offerId = uuidv7();
      const currency = row.country.defaultCurrency;
      await this.prisma.$transaction(async (tx) => {
        await tx.catalogOffer.create({
          data: {
            id: offerId,
            variantId: variant.id,
            sellerOrgId: seller.orgId,
            countryId: row.countryId,
            ownership: seller.ownership,
            status: OfferStatus.PUBLISHED,
            currency,
            publishedAt: new Date(),
          },
        });
        await this.pricing.createVersion(tx, {
          offerId,
          currency,
          costMinor: toMinor('1'),
          listMinor: toMinor('19900'),
          sellMinor: toMinor('9900'),
          validFrom: new Date(),
          validTo: null,
        });
      });
      await this.searchIndex.reindexItem(itemId, row.countryId);
    }
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

  private async filterMarketplaceEligibleOffers<
    T extends { offers: { seller_org_id: string; ownership: OfferOwnership | string }[] },
  >(items: T[]): Promise<T[]> {
    const sellerIds = [
      ...new Set(
        items.flatMap((item) =>
          item.offers
            .filter(
              (offer) =>
                offer.ownership === OfferOwnership.VENDOR_OWNED ||
                offer.ownership === OfferOwnership.MARKETPLACE,
            )
            .map((offer) => offer.seller_org_id),
        ),
      ),
    ];
    const eligible = new Map<string, boolean>();
    await Promise.all(
      sellerIds.map(async (sellerOrgId) => {
        eligible.set(sellerOrgId, await this.marketplace.isCustomerPurchasableSeller(sellerOrgId));
      }),
    );
    return items
      .map((item) => ({
        ...item,
        offers: item.offers.filter((offer) => {
          if (
            offer.ownership !== OfferOwnership.VENDOR_OWNED &&
            offer.ownership !== OfferOwnership.MARKETPLACE
          ) {
            return true;
          }
          return eligible.get(offer.seller_org_id) === true;
        }),
      }))
      .filter((item) => item.offers.length > 0);
  }

  private toPublicItem(
    item: Prisma.CatalogItemGetPayload<{ include: typeof itemInclude }>,
    countryId: string,
    allowedOwnership: OfferOwnership[],
  ) {
    const assortment = item.countries.find((row) => row.countryId === countryId);
    const attributes = parseCatalogAttributes(assortment?.attributes);
    const translation = item.translations[0];
    const offers = item.variants.flatMap((variant) =>
      variant.offers
        .filter((offer) => offer.countryId === countryId && offer.status === OfferStatus.PUBLISHED)
        .filter((offer) => allowedOwnership.includes(offer.ownership))
        .map((offer) => {
          const price = offer.prices[0];
          const sellMinor = price ? price.sellMinor : null;
          const listMinor = price?.listMinor ?? null;
          const discountMinor =
            sellMinor !== null && listMinor !== null && listMinor > sellMinor
              ? (listMinor - sellMinor).toString()
              : null;
          return {
            id: offer.id,
            seller_org_id: offer.sellerOrgId,
            seller_display_name: offer.sellerOrg.displayName,
            ownership: offer.ownership,
            currency: offer.currency,
            sku: variant.skuCode,
            pack_size: variant.packSize,
            strength: variant.strength,
            price: price
              ? {
                  sell_minor: minorJson(price.sellMinor),
                  list_minor: price.listMinor === null ? null : minorJson(price.listMinor),
                  discount_minor: discountMinor,
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
      attributes,
      offers,
    };
  }

  private async withAvailability<
    T extends { kind?: string; offers: { id: string; seller_org_id: string; sku: string }[] },
  >(countryId: string, items: T[]): Promise<(T & { inventory: { available: boolean } })[]> {
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
    const offerKeys = pairs
      .map((row) => {
        const variantId = skuToId.get(row.sku);
        return variantId ? { variantId, sellerOrgId: row.sellerOrgId } : null;
      })
      .filter((row): row is { variantId: string; sellerOrgId: string } => row !== null);
    const availability = offerKeys.length
      ? await this.inventory.availabilityForOffers(countryId, offerKeys)
      : new Map<string, number>();

    return items.map((item) => {
      const enrichedOffers = item.offers.map((offer) => {
        const variantId = skuToId.get(offer.sku);
        const qty = variantId ? availability.get(`${variantId}:${offer.seller_org_id}`) ?? 0 : 0;
        return {
          ...offer,
          inventory: { available: qty > 0, qty },
        };
      });
      const anyAvailable =
        item.kind === 'LAB_TEST' || item.kind === 'IMAGING_STUDY'
          ? item.offers.length > 0
          : enrichedOffers.some((offer) => offer.inventory.available);
      return {
        ...item,
        offers: enrichedOffers,
        inventory: { available: anyAvailable },
      };
    });
  }
}

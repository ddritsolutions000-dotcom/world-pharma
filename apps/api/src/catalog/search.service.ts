import { Injectable } from '@nestjs/common';
import { parseCatalogAttributes, uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { Errors } from '../common/problem';
import { workerTenantContext } from '../tenancy/build-tenant-context';

export type CatalogSearchSort = 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'discount';

export type CatalogSearchFilters = {
  brand?: string;
  category?: string;
  manufacturer?: string;
  rx?: boolean;
  in_stock?: boolean;
};

export type CatalogSearchHit = {
  id: string;
  itemId: string;
  title: string;
  brandName: string;
  categoryName: string;
  inStock: boolean;
  locale: string;
  rxRequired: boolean;
  minSellMinor: bigint | null;
  maxDiscountPct: number | null;
  avgRating: number | null;
  reviewCount: number;
  manufacturerName: string;
  composition: string;
};

export type CatalogSearchPage = {
  data: CatalogSearchHit[];
  next_cursor: string | null;
};

function encodeSearchCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), 'utf8').toString('base64url');
}

function decodeSearchCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: number };
    return typeof parsed.offset === 'number' && parsed.offset >= 0 ? parsed.offset : 0;
  } catch {
    return 0;
  }
}

function orderByForSort(sort: CatalogSearchSort | undefined) {
  switch (sort) {
    case 'price_asc':
      return [{ minSellMinor: 'asc' as const }, { inStock: 'desc' as const }, { title: 'asc' as const }];
    case 'price_desc':
      return [{ minSellMinor: 'desc' as const }, { inStock: 'desc' as const }, { title: 'asc' as const }];
    case 'rating':
      return [{ avgRating: 'desc' as const }, { reviewCount: 'desc' as const }, { title: 'asc' as const }];
    case 'discount':
      return [{ maxDiscountPct: 'desc' as const }, { inStock: 'desc' as const }, { title: 'asc' as const }];
    case 'relevance':
    default:
      return [{ inStock: 'desc' as const }, { title: 'asc' as const }, { id: 'asc' as const }];
  }
}

@Injectable()
export class CatalogSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async reindexItem(itemId: string, countryId: string, locale = 'en'): Promise<void> {
    await runWithTenant(workerTenantContext({ countryId }), () => this.reindexItemInWorkerContext(itemId, countryId, locale));
  }

  private async reindexItemInWorkerContext(itemId: string, countryId: string, locale = 'en'): Promise<void> {
    const item = await this.prisma.catalogItem.findUnique({
      where: { id: itemId },
      include: {
        brand: true,
        category: true,
        translations: true,
        variants: {
          include: {
            offers: {
              where: { countryId, status: 'PUBLISHED' },
              include: { prices: { orderBy: { version: 'desc' }, take: 1 } },
            },
          },
        },
        countries: true,
      },
    });
    if (!item) {
      return;
    }
    const translation = item.translations.find((row) => row.locale === locale) ?? item.translations[0];
    const assortment = item.countries.find((row) => row.countryId === countryId);
    const attributes = parseCatalogAttributes(assortment?.attributes);
    const hasOffer = item.variants.some((variant) => variant.offers.length > 0);
    const published = item.status === 'PUBLISHED' && assortment?.available === true && hasOffer;
    const inStockCount = await this.prisma.inventoryBalance.count({
      where: {
        available: { gt: 0 },
        lot: {
          countryId,
          status: 'ACTIVE',
          variantId: { in: item.variants.map((variant) => variant.id) },
        },
      },
    });
    const inStock = inStockCount > 0;

    let minSellMinor: bigint | null = null;
    let maxDiscountPct: number | null = null;
    for (const variant of item.variants) {
      for (const offer of variant.offers) {
        const price = offer.prices[0];
        if (!price) {
          continue;
        }
        if (minSellMinor === null || price.sellMinor < minSellMinor) {
          minSellMinor = price.sellMinor;
        }
        if (price.listMinor !== null && price.listMinor > price.sellMinor && price.listMinor > 0n) {
          const pct = Math.round(Number(((price.listMinor - price.sellMinor) * 100n) / price.listMinor));
          if (maxDiscountPct === null || pct > maxDiscountPct) {
            maxDiscountPct = pct;
          }
        }
      }
    }

    const reviewAgg = await this.prisma.productReview.aggregate({
      where: { countryId, catalogItemId: itemId, status: 'APPROVED' },
      _avg: { rating: true },
      _count: { rating: true },
    });

    const strengthPack = item.variants
      .map((v) => [v.strength, v.packSize].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(' ');

    await this.prisma.catalogSearchDocument.upsert({
      where: { itemId_countryId_locale: { itemId, countryId, locale } },
      create: {
        id: uuidv7(),
        itemId,
        countryId,
        locale,
        title: translation?.title ?? item.slug,
        body: translation?.description ?? '',
        skuCodes: item.variants.map((v) => v.skuCode).join(' '),
        brandName: item.brand?.name ?? '',
        categoryName: item.category?.name ?? '',
        published,
        inStock,
        rxRequired: assortment?.rxRequired ?? false,
        minSellMinor,
        maxDiscountPct,
        avgRating: reviewAgg._avg.rating,
        reviewCount: reviewAgg._count.rating,
        manufacturerName: attributes.manufacturer_name ?? '',
        composition: [attributes.composition, strengthPack].filter(Boolean).join(' '),
        version: 0,
      },
      update: {
        title: translation?.title ?? item.slug,
        body: translation?.description ?? '',
        skuCodes: item.variants.map((v) => v.skuCode).join(' '),
        brandName: item.brand?.name ?? '',
        categoryName: item.category?.name ?? '',
        published,
        inStock,
        rxRequired: assortment?.rxRequired ?? false,
        minSellMinor,
        maxDiscountPct,
        avgRating: reviewAgg._avg.rating,
        reviewCount: reviewAgg._count.rating,
        manufacturerName: attributes.manufacturer_name ?? '',
        composition: [attributes.composition, strengthPack].filter(Boolean).join(' '),
        version: { increment: 1 },
      },
    });
    await this.dropBrowseCache(countryId);
  }

  async searchPage(
    countryId: string,
    query: string,
    locale = 'en',
    limit = 20,
    filters?: CatalogSearchFilters,
    sort?: CatalogSearchSort,
    cursor?: string,
  ): Promise<CatalogSearchPage> {
    const q = query.trim();
    if (!q) {
      return { data: [], next_cursor: null };
    }
    if (q.length > 200) {
      throw Errors.validation('Search query must be at most 200 characters');
    }
    const take = Math.min(Math.max(limit, 1), 50);
    const offset = decodeSearchCursor(cursor);
    const rows = await this.prisma.catalogSearchDocument.findMany({
      where: this.buildWhere(countryId, locale, q, filters),
      skip: offset,
      take: take + 1,
      orderBy: orderByForSort(sort),
      select: {
        id: true,
        itemId: true,
        title: true,
        brandName: true,
        categoryName: true,
        inStock: true,
        locale: true,
        rxRequired: true,
        minSellMinor: true,
        maxDiscountPct: true,
        avgRating: true,
        reviewCount: true,
        manufacturerName: true,
        composition: true,
      },
    });
    const page = rows.slice(0, take);
    const hasMore = rows.length > take;
    return {
      data: page,
      next_cursor: hasMore ? encodeSearchCursor(offset + page.length) : null,
    };
  }

  async search(
    countryId: string,
    query: string,
    locale = 'en',
    limit = 20,
    filters?: CatalogSearchFilters,
    sort?: CatalogSearchSort,
  ) {
    const page = await this.searchPage(countryId, query, locale, limit, filters, sort);
    return page.data;
  }

  private buildWhere(countryId: string, locale: string, q: string, filters?: CatalogSearchFilters) {
    return {
      countryId,
      locale,
      published: true,
      ...(filters?.brand ? { brandName: { equals: filters.brand, mode: 'insensitive' as const } } : {}),
      ...(filters?.category ? { categoryName: { equals: filters.category, mode: 'insensitive' as const } } : {}),
      ...(filters?.manufacturer
        ? { manufacturerName: { contains: filters.manufacturer, mode: 'insensitive' as const } }
        : {}),
      ...(filters?.rx !== undefined ? { rxRequired: filters.rx } : {}),
      ...(filters?.in_stock !== undefined ? { inStock: filters.in_stock } : {}),
      OR: [
        { title: { contains: q, mode: 'insensitive' as const } },
        { body: { contains: q, mode: 'insensitive' as const } },
        { skuCodes: { contains: q, mode: 'insensitive' as const } },
        { brandName: { contains: q, mode: 'insensitive' as const } },
        { categoryName: { contains: q, mode: 'insensitive' as const } },
        { manufacturerName: { contains: q, mode: 'insensitive' as const } },
        { composition: { contains: q, mode: 'insensitive' as const } },
      ],
    };
  }

  async readBrowseCache(key: string): Promise<{ country_enabled: boolean; data: unknown[]; next_cursor: string | null } | null> {
    try {
      if (this.redis.client.status === 'wait') {
        await this.redis.client.connect();
      }
      const raw = await this.redis.client.get(key);
      return raw
        ? (JSON.parse(raw) as { country_enabled: boolean; data: unknown[]; next_cursor: string | null })
        : null;
    } catch {
      return null;
    }
  }

  async writeBrowseCache(key: string, value: unknown): Promise<void> {
    try {
      if (this.redis.client.status === 'wait') {
        await this.redis.client.connect();
      }
      await this.redis.client.set(key, JSON.stringify(value), 'EX', 60);
    } catch {
      // cache is best-effort
    }
  }

  async dropBrowseCache(countryId: string): Promise<void> {
    try {
      if (this.redis.client.status === 'wait') {
        await this.redis.client.connect();
      }
      const keys = await this.redis.client.keys(`catalog:browse:${countryId}:*`);
      if (keys.length) {
        await this.redis.client.del(...keys);
      }
    } catch {
      // cache is best-effort
    }
  }
}

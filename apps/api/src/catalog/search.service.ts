import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { RedisService } from '../app/redis.service';
import { Errors } from '../common/problem';
import { workerTenantContext } from '../tenancy/build-tenant-context';

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
        variants: { include: { offers: { where: { countryId, status: 'PUBLISHED' } } } },
        countries: true,
      },
    });
    if (!item) {
      return;
    }
    const translation = item.translations.find((row) => row.locale === locale) ?? item.translations[0];
    const assortment = item.countries.find((row) => row.countryId === countryId);
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
        version: { increment: 1 },
      },
    });
    await this.dropBrowseCache(countryId);
  }

  async search(countryId: string, query: string, locale = 'en', limit = 20, filters?: { brand?: string; category?: string }) {
    const q = query.trim();
    if (!q) {
      return [];
    }
    if (q.length > 200) {
      throw Errors.validation('Search query must be at most 200 characters');
    }
    const take = Math.min(Math.max(limit, 1), 50);
    return this.prisma.catalogSearchDocument.findMany({
      where: {
        countryId,
        locale,
        published: true,
        ...(filters?.brand ? { brandName: { equals: filters.brand, mode: 'insensitive' } } : {}),
        ...(filters?.category ? { categoryName: { equals: filters.category, mode: 'insensitive' } } : {}),
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { body: { contains: q, mode: 'insensitive' } },
          { skuCodes: { contains: q, mode: 'insensitive' } },
          { brandName: { contains: q, mode: 'insensitive' } },
          { categoryName: { contains: q, mode: 'insensitive' } },
        ],
      },
      take,
      orderBy: [{ inStock: 'desc' }, { title: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        itemId: true,
        title: true,
        brandName: true,
        categoryName: true,
        inStock: true,
        locale: true,
      },
    });
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

import { Injectable } from '@nestjs/common';
import { PersonalizationEventKind } from '@prisma/client';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { minorJson } from '../catalog/money';
import type { Principal } from '../identity/current-principal';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { RECOMMENDATION_RECENTLY_VIEWED_MAX } from './recommendation-query';
import type { RecentlyViewedProduct, RecentlyViewedResponse } from './recently-viewed.types';

@Injectable()
export class RecentlyViewedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async list(
    principal: Principal,
    countryCode: string,
    locale = 'en',
    limit = 12,
  ): Promise<RecentlyViewedResponse> {
    const country = await this.catalog.resolveCountry(countryCode);
    const take = Math.min(Math.max(limit, 1), RECOMMENDATION_RECENTLY_VIEWED_MAX);

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const viewEvents = await this.prisma.personalizationEvent.findMany({
          where: {
            countryId: country.id,
            personId: principal.personId,
            eventKind: PersonalizationEventKind.PRODUCT_VIEWED,
            catalogItemId: { not: null },
          },
          orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
          take: RECOMMENDATION_RECENTLY_VIEWED_MAX,
          select: { catalogItemId: true, occurredAt: true },
        });

        const recent: Array<{ itemId: string; viewedAt: Date }> = [];
        const seen = new Set<string>();
        for (const event of viewEvents) {
          const id = event.catalogItemId!;
          if (seen.has(id)) continue;
          seen.add(id);
          recent.push({ itemId: id, viewedAt: event.occurredAt });
          if (recent.length >= take) break;
        }

        if (!recent.length) {
          return {
            country: country.isoAlpha2,
            locale,
            sandbox: true,
            data: [],
          };
        }

        const itemIds = recent.map((row) => row.itemId);
        const docs = await this.prisma.catalogSearchDocument.findMany({
          where: { countryId: country.id, locale, itemId: { in: itemIds } },
          select: {
            itemId: true,
            title: true,
            brandName: true,
            categoryName: true,
            published: true,
            inStock: true,
            rxRequired: true,
            minSellMinor: true,
          },
        });
        const docByItem = new Map(docs.map((row) => [row.itemId, row]));

        const slugRows = await this.prisma.catalogItem.findMany({
          where: { id: { in: itemIds } },
          select: {
            id: true,
            slug: true,
            status: true,
            assets: { orderBy: { sortOrder: 'asc' }, take: 1, select: { publicUrl: true } },
          },
        });
        const metaByItem = new Map(
          slugRows.map((row) => [
            row.id,
            {
              slug: row.slug,
              published: row.status === 'PUBLISHED',
              image_url: row.assets[0]?.publicUrl ?? null,
            },
          ]),
        );

        const offerRows = await this.prisma.catalogOffer.findMany({
          where: {
            countryId: country.id,
            status: 'PUBLISHED',
            variant: { itemId: { in: itemIds } },
          },
          include: {
            prices: { where: { isCurrent: true }, take: 1, orderBy: { version: 'desc' } },
            variant: { select: { itemId: true } },
          },
        });
        const bestOfferByItem = new Map<string, { id: string; sell: bigint }>();
        for (const offer of offerRows) {
          const sell = offer.prices[0]?.sellMinor;
          if (sell == null) continue;
          const itemId = offer.variant.itemId;
          const existing = bestOfferByItem.get(itemId);
          if (!existing || sell < existing.sell) {
            bestOfferByItem.set(itemId, { id: offer.id, sell });
          }
        }

        const data: RecentlyViewedProduct[] = recent.map(({ itemId, viewedAt }) => {
          const doc = docByItem.get(itemId);
          const meta = metaByItem.get(itemId);
          const slug = meta?.slug ?? itemId;
          const published = Boolean(doc?.published && meta?.published);
          const inStock = Boolean(doc?.inStock);
          const available = published;
          let unavailable_reason: string | null = null;
          if (!published) {
            unavailable_reason = 'Product is no longer available.';
          } else if (!inStock) {
            unavailable_reason = 'Out of stock at current sellers.';
          }

          return {
            item_id: itemId,
            slug,
            title: doc?.title ?? slug,
            brand_name: doc?.brandName ?? '',
            category_name: doc?.categoryName ?? '',
            viewed_at: viewedAt.toISOString(),
            available,
            in_stock: inStock,
            rx_required: doc?.rxRequired ?? false,
            sell_minor: doc?.minSellMinor != null ? minorJson(doc.minSellMinor) : null,
            currency: country.defaultCurrency,
            best_offer_id: available ? bestOfferByItem.get(itemId)?.id ?? null : null,
            unavailable_reason,
            href: `/p/${slug}`,
            image_url: meta?.image_url ?? null,
          };
        });

        return {
          country: country.isoAlpha2,
          locale,
          sandbox: true,
          data,
        };
      },
    );
  }
}

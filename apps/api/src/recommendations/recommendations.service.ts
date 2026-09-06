import { Injectable } from '@nestjs/common';
import { PersonalizationEventKind } from '@prisma/client';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { Errors } from '../common/problem';
import { assertUuid } from '../cms/cms-country';
import type { Principal } from '../identity/current-principal';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import {
  RECOMMENDATION_DEFAULT_LIMIT,
  RECOMMENDATION_MAX_LIMIT,
  RECOMMENDATION_RECENTLY_VIEWED_MAX,
  RECOMMENDATION_RULE_VERSION,
  type ItemRecommendationsResponse,
  type PersonalRecommendationsResponse,
  type RecommendationProduct,
} from './recommendation-query';

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  async getItemRecommendations(
    itemId: string,
    countryCode: string,
    locale = 'en',
    limit = RECOMMENDATION_DEFAULT_LIMIT,
  ): Promise<ItemRecommendationsResponse> {
    assertUuid(itemId, 'itemId');
    const country = await this.catalog.resolveCountry(countryCode);
    const flags = await this.catalog.storefrontFlags(country.isoAlpha2);
    const countryEnabled = flags.pharmacy || flags.marketplace || flags.lab;
    const take = Math.min(Math.max(limit, 1), RECOMMENDATION_MAX_LIMIT);

    if (!countryEnabled) {
      return this.emptyItemResponse(country.isoAlpha2, locale, itemId, false);
    }

    const source = await this.prisma.catalogSearchDocument.findFirst({
      where: { itemId, countryId: country.id, locale, published: true },
      select: { itemId: true, categoryName: true, title: true },
    });
    if (!source) {
      throw Errors.notFound('Product not found or not eligible for recommendations.');
    }

    const relatedDocs = source.categoryName
      ? await this.prisma.catalogSearchDocument.findMany({
          where: {
            countryId: country.id,
            locale,
            published: true,
            inStock: true,
            categoryName: source.categoryName,
            itemId: { not: itemId },
          },
          orderBy: [{ inStock: 'desc' }, { title: 'asc' }, { id: 'asc' }],
          take,
          select: {
            itemId: true,
            title: true,
            brandName: true,
            categoryName: true,
            inStock: true,
          },
        })
      : [];

    const pairRows = await this.prisma.analyticsOrderItemPair.findMany({
      where: {
        countryId: country.id,
        ruleVersion: RECOMMENDATION_RULE_VERSION,
        OR: [{ itemAId: itemId }, { itemBId: itemId }],
      },
      orderBy: [{ pairCount: 'desc' }, { itemAId: 'asc' }, { itemBId: 'asc' }],
      take: take * 2,
    });
    const partnerIds = pairRows
      .map((row) => (row.itemAId === itemId ? row.itemBId : row.itemAId))
      .filter((id) => id !== itemId);
    const coDocs = partnerIds.length
      ? await this.prisma.catalogSearchDocument.findMany({
          where: {
            countryId: country.id,
            locale,
            published: true,
            inStock: true,
            itemId: { in: partnerIds },
          },
          select: {
            itemId: true,
            title: true,
            brandName: true,
            categoryName: true,
            inStock: true,
          },
        })
      : [];
    const coByItem = new Map(coDocs.map((row) => [row.itemId, row]));
    const cooccurrenceDocs = partnerIds
      .map((id) => coByItem.get(id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .slice(0, take);

    const slugByItem = await this.slugMap([itemId, ...relatedDocs.map((r) => r.itemId), ...cooccurrenceDocs.map((r) => r.itemId)]);

    return {
      country: country.isoAlpha2,
      locale,
      item_id: itemId,
      rule_version: RECOMMENDATION_RULE_VERSION,
      country_enabled: true,
      sections: {
        related: {
          kind: 'related',
          data: relatedDocs.map((row) => this.presentProduct(row, slugByItem)),
        },
        frequently_bought_together: {
          kind: 'frequently_bought_together',
          data: cooccurrenceDocs.map((row) => this.presentProduct(row, slugByItem)),
        },
      },
    };
  }

  async getPersonalRecommendations(
    principal: Principal,
    countryCode: string,
    locale = 'en',
    limit = RECOMMENDATION_DEFAULT_LIMIT,
  ): Promise<PersonalRecommendationsResponse> {
    const country = await this.catalog.resolveCountry(countryCode);
    const flags = await this.catalog.storefrontFlags(country.isoAlpha2);
    const countryEnabled = flags.pharmacy || flags.marketplace || flags.lab;
    const take = Math.min(Math.max(limit, 1), RECOMMENDATION_MAX_LIMIT);

    if (!countryEnabled) {
      return this.emptyPersonalResponse(country.isoAlpha2, locale, false);
    }

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
        const recentItemIds: string[] = [];
        const seenRecent = new Set<string>();
        for (const event of viewEvents) {
          const id = event.catalogItemId!;
          if (seenRecent.has(id)) {
            continue;
          }
          seenRecent.add(id);
          recentItemIds.push(id);
          if (recentItemIds.length >= take) {
            break;
          }
        }

        const wishlist = await this.prisma.wishlistItem.findMany({
          where: { personId: principal.personId, countryId: country.id },
          include: {
            catalogOffer: {
              include: { variant: { select: { itemId: true, item: { select: { categoryId: true } } } } },
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        });
        const wishlistItemIds = new Set(
          wishlist.map((row) => row.catalogOffer.variant.itemId).filter((id): id is string => Boolean(id)),
        );
        const categoryIds = [
          ...new Set(
            wishlist
              .map((row) => row.catalogOffer.variant.item.categoryId)
              .filter((id): id is string => Boolean(id)),
          ),
        ];

        let wishlistAdjacentDocs: Array<{
          itemId: string;
          title: string;
          brandName: string;
          categoryName: string;
          inStock: boolean;
        }> = [];
        if (categoryIds.length) {
          const itemsInCategories = await this.prisma.catalogItem.findMany({
            where: { categoryId: { in: categoryIds }, status: 'PUBLISHED' },
            select: { id: true },
          });
          const candidateIds = itemsInCategories
            .map((row) => row.id)
            .filter((id) => !wishlistItemIds.has(id));
          if (candidateIds.length) {
            wishlistAdjacentDocs = await this.prisma.catalogSearchDocument.findMany({
              where: {
                countryId: country.id,
                locale,
                published: true,
                inStock: true,
                itemId: { in: candidateIds },
              },
              orderBy: [{ categoryName: 'asc' }, { title: 'asc' }, { id: 'asc' }],
              take,
              select: {
                itemId: true,
                title: true,
                brandName: true,
                categoryName: true,
                inStock: true,
              },
            });
          }
        }

        const recentDocs = recentItemIds.length
          ? await this.prisma.catalogSearchDocument.findMany({
              where: {
                countryId: country.id,
                locale,
                published: true,
                itemId: { in: recentItemIds },
              },
              select: {
                itemId: true,
                title: true,
                brandName: true,
                categoryName: true,
                inStock: true,
              },
            })
          : [];
        const recentByItem = new Map(recentDocs.map((row) => [row.itemId, row]));
        const orderedRecent = recentItemIds
          .map((id) => recentByItem.get(id))
          .filter((row): row is NonNullable<typeof row> => Boolean(row));

        const slugByItem = await this.slugMap([
          ...orderedRecent.map((r) => r.itemId),
          ...wishlistAdjacentDocs.map((r) => r.itemId),
        ]);

        return {
          country: country.isoAlpha2,
          locale,
          rule_version: RECOMMENDATION_RULE_VERSION,
          country_enabled: true,
          sections: {
            recently_viewed: {
              kind: 'recently_viewed' as const,
              data: orderedRecent.map((row) => this.presentProduct(row, slugByItem)),
            },
            wishlist_adjacent: {
              kind: 'wishlist_adjacent' as const,
              data: wishlistAdjacentDocs.map((row) => this.presentProduct(row, slugByItem)),
            },
          },
        };
      },
    );
  }

  private presentProduct(
    row: { itemId: string; title: string; brandName: string; categoryName: string; inStock: boolean },
    metaByItem: Map<string, { slug: string; image_url: string | null }>,
  ): RecommendationProduct {
    const meta = metaByItem.get(row.itemId);
    const slug = meta?.slug ?? row.itemId;
    return {
      item_id: row.itemId,
      title: row.title,
      slug,
      brand_name: row.brandName,
      category_name: row.categoryName,
      in_stock: row.inStock,
      href: `/p/${slug}`,
      image_url: meta?.image_url ?? null,
    };
  }

  private async slugMap(itemIds: string[]): Promise<Map<string, { slug: string; image_url: string | null }>> {
    const unique = [...new Set(itemIds)];
    if (!unique.length) {
      return new Map();
    }
    const rows = await this.prisma.catalogItem.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        slug: true,
        assets: { orderBy: { sortOrder: 'asc' }, take: 1, select: { publicUrl: true } },
      },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        { slug: row.slug, image_url: row.assets[0]?.publicUrl ?? null },
      ]),
    );
  }

  private emptyItemResponse(
    country: string,
    locale: string,
    itemId: string,
    countryEnabled: boolean,
  ): ItemRecommendationsResponse {
    return {
      country,
      locale,
      item_id: itemId,
      rule_version: RECOMMENDATION_RULE_VERSION,
      country_enabled: countryEnabled,
      sections: {
        related: { kind: 'related', data: [] },
        frequently_bought_together: { kind: 'frequently_bought_together', data: [] },
      },
    };
  }

  private emptyPersonalResponse(
    country: string,
    locale: string,
    countryEnabled: boolean,
  ): PersonalRecommendationsResponse {
    return {
      country,
      locale,
      rule_version: RECOMMENDATION_RULE_VERSION,
      country_enabled: countryEnabled,
      sections: {
        recently_viewed: { kind: 'recently_viewed', data: [] },
        wishlist_adjacent: { kind: 'wishlist_adjacent', data: [] },
      },
    };
  }
}

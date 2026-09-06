import { Injectable } from '@nestjs/common';
import { CatalogLifecycle, OfferStatus } from '@prisma/client';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { MedicineSubstituteEdgeService } from './medicine-substitute-edge.service';

type SubstituteItemInclude = {
  brand: true;
  category: true;
  translations: true;
  assets: { orderBy: { sortOrder: 'asc' }; take: number };
  variants: {
    include: {
      offers: {
        where: { status: OfferStatus };
        include: {
          prices: { where: { isCurrent: true } };
          sellerOrg: { select: { id: true; displayName: true } };
        };
      };
    };
  };
};

/**
 * 1mg-style medicine substitute service
 * Provides cheaper alternatives and generic substitutes with price comparison
 */
@Injectable()
export class MedicineSubstituteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly edges: MedicineSubstituteEdgeService,
  ) {}

  /**
   * Get medicine substitutes for a given catalog item
   * Returns cheaper alternatives, generics, and therapeutic equivalents
   */
  async getSubstitutes(
    principal: Principal | null,
    itemId: string,
    countryCode: string,
  ) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: countryCode.toUpperCase() },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal?.personId }),
      async () => {
        // Get the original item
        const originalItem = await this.prisma.catalogItem.findFirst({
          where: {
            id: itemId,
            status: CatalogLifecycle.PUBLISHED,
            countries: { some: { countryId: country.id, available: true } },
          },
          include: {
            brand: true,
            category: true,
            translations: true,
            variants: {
              include: {
                offers: {
                  where: { status: OfferStatus.PUBLISHED },
                  include: {
                    prices: { where: { isCurrent: true } },
                    sellerOrg: { select: { id: true, displayName: true } },
                  },
                },
              },
            },
          },
        });

        if (!originalItem) {
          throw Errors.notFound('Medicine not found');
        }

        const originalPrice = this.getLowestPrice(originalItem);
        const configuredIds = await this.edges.configuredSubstituteItemIds(country.id, itemId);
        const substituteInclude = this.substituteInclude();

        const configuredItems =
          configuredIds.length > 0
            ? await this.prisma.catalogItem.findMany({
                where: {
                  id: { in: configuredIds },
                  status: CatalogLifecycle.PUBLISHED,
                  countries: { some: { countryId: country.id, available: true } },
                },
                include: substituteInclude,
              })
            : [];

        const configuredById = new Map(configuredItems.map((row) => [row.id, row]));
        const configuredOrdered = configuredIds
          .map((id) => configuredById.get(id))
          .filter((row): row is (typeof configuredItems)[number] => Boolean(row));

        const heuristicItems = await this.prisma.catalogItem.findMany({
          where: {
            id: { notIn: [itemId, ...configuredIds] },
            status: CatalogLifecycle.PUBLISHED,
            kind: originalItem.kind,
            countries: { some: { countryId: country.id, available: true } },
            OR: [{ categoryId: originalItem.categoryId }],
          },
          include: substituteInclude,
          take: 10,
        });

        const configuredProcessed = configuredOrdered.map((item) =>
          this.presentSubstitute(item, originalPrice, { includeWithoutPrice: true }),
        );

        const heuristicProcessed = heuristicItems
          .map((item) => this.presentSubstitute(item, originalPrice))
          .filter((sub) => sub.lowest_price !== null)
          .sort((a, b) => (a.lowest_price || 0) - (b.lowest_price || 0));

        const seen = new Set<string>();
        const processedSubstitutes = [];
        for (const sub of [...configuredProcessed, ...heuristicProcessed]) {
          if (seen.has(sub.id)) {
            continue;
          }
          seen.add(sub.id);
          processedSubstitutes.push(sub);
        }

        const originalTranslation = originalItem.translations?.[0] || {};
        return {
          original: {
            id: originalItem.id,
            slug: originalItem.slug,
            name: originalTranslation.title || originalItem.slug,
            brand: originalItem.brand?.name,
            category: originalItem.category?.name,
            lowest_price: originalPrice,
          },
          substitutes: processedSubstitutes,
          total_substitutes: processedSubstitutes.length,
        };
      },
    );
  }

  private substituteInclude(): SubstituteItemInclude {
    return {
      brand: true,
      category: true,
      translations: true,
      assets: { orderBy: { sortOrder: 'asc' }, take: 1 },
      variants: {
        include: {
          offers: {
            where: { status: OfferStatus.PUBLISHED },
            include: {
              prices: { where: { isCurrent: true } },
              sellerOrg: { select: { id: true, displayName: true } },
            },
          },
        },
      },
    };
  }

  private presentSubstitute(
    item: {
      id: string;
      slug: string;
      brand?: { name: string } | null;
      category?: { name: string } | null;
      translations?: Array<{ title?: string }>;
      assets?: Array<{ publicUrl?: string | null }>;
      variants?: Array<{
        offers?: Array<{
          id: string;
          currency?: string;
          prices?: Array<{ isCurrent?: boolean; sellMinor: bigint | number | string; currency?: string }>;
        }>;
      }>;
      regulatedClass?: string | null;
      brandId?: string | null;
    },
    originalPrice: number | null,
    options?: { includeWithoutPrice?: boolean },
  ) {
    const offer = this.getLowestOffer(item);
    const lowestPrice = offer?.major ?? null;
    const savingsPercent =
      originalPrice && lowestPrice && originalPrice > lowestPrice
        ? Math.round(((originalPrice - lowestPrice) / originalPrice) * 100)
        : null;
    const translation = item.translations?.[0] || {};

    return {
      id: item.id,
      slug: item.slug,
      name: translation.title || item.slug,
      brand: item.brand?.name,
      category: item.category?.name,
      lowest_price: lowestPrice,
      original_price: originalPrice,
      savings: savingsPercent && savingsPercent > 0 && lowestPrice != null && originalPrice != null
        ? originalPrice - lowestPrice
        : null,
      savings_percent: savingsPercent && savingsPercent > 0 ? savingsPercent : null,
      is_generic: this.isGeneric(item),
      requires_prescription: this.requiresPrescription(item),
      offer_id: offer?.offerId ?? null,
      sell_minor: offer?.sellMinor ?? null,
      currency: offer?.currency ?? null,
      image_url: item.assets?.[0]?.publicUrl ?? null,
    };
  }

  /**
   * Get price comparison across multiple sellers for a medicine
   */
  async getPriceComparison(
    principal: Principal,
    itemId: string,
    countryCode: string,
  ) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: countryCode.toUpperCase() },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const item = await this.prisma.catalogItem.findFirst({
          where: {
            id: itemId,
            status: CatalogLifecycle.PUBLISHED,
            countries: { some: { countryId: country.id, available: true } },
          },
          include: {
            brand: true,
            translations: true,
            variants: {
              include: {
                offers: {
                  where: { status: OfferStatus.PUBLISHED },
                  include: {
                    prices: { where: { isCurrent: true } },
                    sellerOrg: { select: { id: true, displayName: true } },
                  },
                },
              },
            },
          },
        });

        if (!item) {
          throw Errors.notFound('Medicine not found');
        }

        // Collect all offers from different sellers
        const offers: any[] = [];
        for (const variant of item.variants) {
          for (const offer of variant.offers) {
            const price = offer.prices[0];
            if (price) {
              offers.push({
                seller_id: offer.sellerOrg.id,
                seller_name: offer.sellerOrg.displayName,
                variant_id: variant.id,
                variant_name: variant.packSize,
                price: Number(price.sellMinor) / 100, // Convert to major units
                currency: price.currency,
                stock_available: 0, // Not available in current schema
                delivery_tier: 'standard', // Not available in current schema
              });
            }
          }
        }

        // Sort by price
        offers.sort((a, b) => a.price - b.price);

        const lowestPrice = offers.length > 0 ? offers[0].price : null;
        const highestPrice = offers.length > 0 ? offers[offers.length - 1].price : null;

        const translation = item.translations?.[0] || {};
        return {
          medicine: {
            id: item.id,
            slug: item.slug,
            name: translation.title || item.slug,
            brand: item.brand?.name,
          },
          offers,
          price_range: {
            lowest: lowestPrice,
            highest: highestPrice,
            difference: lowestPrice && highestPrice ? highestPrice - lowestPrice : null,
          },
          total_sellers: new Set(offers.map(o => o.seller_id)).size,
        };
      }
    );
  }

  /**
   * Get generic alternatives for branded medicines
   */
  async getGenericAlternatives(
    principal: Principal,
    itemId: string,
    countryCode: string,
  ) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: countryCode.toUpperCase() },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const originalItem = await this.prisma.catalogItem.findFirst({
          where: {
            id: itemId,
            status: CatalogLifecycle.PUBLISHED,
            countries: { some: { countryId: country.id, available: true } },
          },
          include: {
            brand: true,
            category: true,
            translations: true,
          },
        });

        if (!originalItem) {
          throw Errors.notFound('Medicine not found');
        }

        // Find generic alternatives (items without brand or generic brands)
        const generics = await this.prisma.catalogItem.findMany({
          where: {
            id: { not: itemId },
            status: CatalogLifecycle.PUBLISHED,
            kind: originalItem.kind,
            categoryId: originalItem.categoryId,
            countries: { some: { countryId: country.id, available: true } },
            OR: [
              { brandId: null }, // No brand (generic)
              { brand: { name: { contains: 'generic', mode: 'insensitive' } } },
            ],
          },
          include: {
            brand: true,
            translations: true,
            variants: {
              include: {
                offers: {
                  where: { status: OfferStatus.PUBLISHED },
                  include: {
                    prices: { where: { isCurrent: true } },
                  },
                },
              },
            },
          },
          take: 5,
        });

        const originalPrice = this.getLowestPrice(
          (await this.prisma.catalogItem.findFirst({
            where: { id: itemId },
            include: {
              variants: {
                include: {
                  offers: {
                    where: { status: OfferStatus.PUBLISHED },
                    include: { prices: { where: { isCurrent: true } } },
                  },
                },
              },
            },
          })) ?? { variants: [] },
        );

        return {
          original_price: originalPrice,
          generics: generics.map((item) => {
            const lowestPrice = this.getLowestPrice(item);
            const savings = originalPrice && lowestPrice 
              ? originalPrice - lowestPrice 
              : null;
            const savingsPercent = originalPrice && lowestPrice && originalPrice > 0
              ? Math.round((savings! / originalPrice) * 100)
              : null;
            const translation = item.translations?.[0] || {};

            return {
              id: item.id,
              slug: item.slug,
              name: translation.title || item.slug,
              brand: item.brand?.name || 'Generic',
              lowest_price: lowestPrice,
              savings,
              savings_percent: savingsPercent,
            };
          }),
        };
      }
    );
  }

  private getLowestOffer(item: {
    variants?: Array<{
      offers?: Array<{
        id: string;
        currency?: string;
        prices?: Array<{ isCurrent?: boolean; sellMinor: bigint | number | string; currency?: string }>;
      }>;
    }>;
  }): { offerId: string; sellMinor: string; currency: string; major: number } | null {
    let best: { offerId: string; sellMinor: bigint; currency: string } | null = null;
    for (const variant of item.variants || []) {
      for (const offer of variant.offers || []) {
        const price =
          (offer.prices || []).find((row) => row.isCurrent) ?? offer.prices?.[0];
        if (!price) {
          continue;
        }
        const sellMinor = BigInt(price.sellMinor);
        if (!best || sellMinor < best.sellMinor) {
          best = {
            offerId: offer.id,
            sellMinor,
            currency: price.currency ?? offer.currency ?? 'XXX',
          };
        }
      }
    }
    if (!best) {
      return null;
    }
    return {
      offerId: best.offerId,
      sellMinor: best.sellMinor.toString(),
      currency: best.currency,
      major: Number(best.sellMinor) / 100,
    };
  }

  private getLowestPrice(item: {
    variants?: Array<{
      offers?: Array<{
        id: string;
        currency?: string;
        prices?: Array<{ isCurrent?: boolean; sellMinor: bigint | number | string; currency?: string }>;
      }>;
    }>;
  }): number | null {
    return this.getLowestOffer(item)?.major ?? null;
  }

  private isGeneric(item: { brandId?: string | null; brand?: { name?: string } | null }): boolean {
    if (!item.brandId) return true;
    if (item.brand && item.brand.name) {
      const name = item.brand.name.toLowerCase();
      return name.includes('generic') || name.includes('unbranded');
    }
    return false;
  }

  private requiresPrescription(item: any): boolean {
    // Check if item requires prescription based on regulated class
    if (item.regulatedClass) {
      return ['RX', 'CONTROLLED'].includes(item.regulatedClass);
    }
    return false;
  }
}

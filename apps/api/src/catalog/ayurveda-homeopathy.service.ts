import { Injectable } from '@nestjs/common';
import { CatalogLifecycle, CatalogItemKind, OfferStatus, Prisma } from '@prisma/client';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { requireCountryCode, resolveCountryByCode } from '../catalog/catalog-country';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { workerTenantContext } from '../tenancy/build-tenant-context';

/**
 * Ayurveda and Homeopathy service - 1mg-style alternative medicine categories
 * Provides specialized management for Ayurvedic and Homeopathic products
 */
@Injectable()
export class AyurvedaHomeopathyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get Ayurveda products (1mg-style Ayurveda category)
   */
  async getAyurvedaProducts(
    principal: Principal,
    query: {
      country_code?: string;
      category?: string;
      search?: string;
      limit?: number;
    }
  ) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: requireCountryCode(query.country_code) },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const limit = Math.min(50, Math.max(1, query.limit || 20));
        
        // Filter for Ayurveda products (using category or attributes)
        const where: Prisma.CatalogItemWhereInput = {
          status: CatalogLifecycle.PUBLISHED,
          countries: { some: { countryId: country.id, available: true } },
          OR: [
            { category: { slug: { contains: 'ayurveda', mode: 'insensitive' } } },
            { translations: { some: { title: { contains: 'ayurveda', mode: 'insensitive' } } } },
            // In real implementation, would have dedicated AYURVEDA kind
          ],
        };

        if (query.category) {
          where.category = { slug: query.category };
        }

        if (query.search) {
          where.OR = [
            { translations: { some: { title: { contains: query.search, mode: 'insensitive' } } } },
            { translations: { some: { description: { contains: query.search, mode: 'insensitive' } } } },
          ];
        }

        const items = await this.prisma.catalogItem.findMany({
          where,
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
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        return {
          products: items.map((item) => this.presentAyurvedaProduct(item)),
          total: items.length,
          category: 'ayurveda',
        };
      }
    );
  }

  /**
   * Get Homeopathy products (1mg-style Homeopathy category)
   */
  async getHomeopathyProducts(
    principal: Principal,
    query: {
      country_code?: string;
      category?: string;
      search?: string;
      limit?: number;
    }
  ) {
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: requireCountryCode(query.country_code) },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        const limit = Math.min(50, Math.max(1, query.limit || 20));
        
        // Filter for Homeopathy products
        const where: Prisma.CatalogItemWhereInput = {
          status: CatalogLifecycle.PUBLISHED,
          countries: { some: { countryId: country.id, available: true } },
          OR: [
            { category: { slug: { contains: 'homeopathy', mode: 'insensitive' } } },
            { translations: { some: { title: { contains: 'homeopathy', mode: 'insensitive' } } } },
          ],
        };

        if (query.category) {
          where.category = { slug: query.category };
        }

        if (query.search) {
          where.OR = [
            { translations: { some: { title: { contains: query.search, mode: 'insensitive' } } } },
            { translations: { some: { description: { contains: query.search, mode: 'insensitive' } } } },
          ];
        }

        const items = await this.prisma.catalogItem.findMany({
          where,
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
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });

        return {
          products: items.map((item) => this.presentHomeopathyProduct(item)),
          total: items.length,
          category: 'homeopathy',
        };
      }
    );
  }

  /**
   * Get Ayurveda categories (1mg-style subcategories)
   */
  async getAyurvedaCategories() {
    const categories = [
      { slug: 'herbal-supplements', name: 'Herbal Supplements', description: 'Natural herbal supplements and remedies' },
      { slug: 'personal-care', name: 'Personal Care', description: 'Ayurvedic personal care products' },
      { slug: 'digestive-health', name: 'Digestive Health', description: 'Digestive aids and natural remedies' },
      { slug: 'immunity', name: 'Immunity Boosters', description: 'Natural immunity strengthening products' },
      { slug: 'stress-relief', name: 'Stress Relief', description: 'Natural stress management products' },
      { slug: 'joint-care', name: 'Joint Care', description: 'Ayurvedic joint and muscle care' },
      { slug: 'skin-care', name: 'Skin Care', description: 'Natural skin care solutions' },
      { slug: 'hair-care', name: 'Hair Care', description: 'Ayurvedic hair care products' },
    ];

    return { categories };
  }

  /**
   * Get Homeopathy categories (1mg-style subcategories)
   */
  async getHomeopathyCategories() {
    const categories = [
      { slug: 'constitutional-remedies', name: 'Constitutional Remedies', description: 'Individualized homeopathic treatments' },
      { slug: 'acute-conditions', name: 'Acute Conditions', description: 'Remedies for acute health issues' },
      { slug: 'chronic-conditions', name: 'Chronic Conditions', description: 'Long-term condition management' },
      { slug: 'pediatric', name: 'Pediatric', description: 'Homeopathic remedies for children' },
      { slug: 'mother-baby', name: 'Mother & Baby', description: 'Pregnancy and infant care remedies' },
      { slug: 'first-aid', name: 'First Aid', description: 'Homeopathic first aid remedies' },
      { slug: 'mental-emotional', name: 'Mental & Emotional', description: 'Emotional and mental health remedies' },
    ];

    return { categories };
  }

  /**
   * Get alternative medicine brands (1mg-style brand showcase)
   */
  async getAlternativeMedicineBrands(
    principal: Principal,
    countryCode?: string
  ) {
    const code = requireCountryCode(countryCode);
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: code },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }

    return runWithTenant(
      workerTenantContext({ countryId: country.id, personId: principal.personId }),
      async () => {
        // Get brands that have Ayurveda/Homeopathy products
        const brands = await this.prisma.catalogBrand.findMany({
          where: {
            items: {
              some: {
                status: CatalogLifecycle.PUBLISHED,
                countries: { some: { countryId: country.id, available: true } },
                OR: [
                  { category: { slug: { contains: 'ayurveda', mode: 'insensitive' } } },
                  { category: { slug: { contains: 'homeopathy', mode: 'insensitive' } } },
                ],
              },
            },
          },
          orderBy: { name: 'asc' },
          take: 20,
        });

        return {
          brands: brands.map((brand) => ({
            id: brand.id,
            slug: brand.slug,
            name: brand.name,
          })),
        };
      }
    );
  }

  /**
   * Get health conditions and remedies (1mg-style condition-based shopping)
   */
  async getConditionBasedRemedies(principal: Principal, countryCode?: string) {
    const conditions = [
      {
        slug: 'diabetes',
        name: 'Diabetes Management',
        description: 'Natural support for diabetes management',
        ayurveda_remedies: true,
        homeopathy_remedies: true,
      },
      {
        slug: 'hypertension',
        name: 'Blood Pressure',
        description: 'Natural blood pressure support',
        ayurveda_remedies: true,
        homeopathy_remedies: true,
      },
      {
        slug: 'arthritis',
        name: 'Joint Pain & Arthritis',
        description: 'Natural joint pain relief',
        ayurveda_remedies: true,
        homeopathy_remedies: true,
      },
      {
        slug: 'digestive-issues',
        name: 'Digestive Issues',
        description: 'Natural digestive support',
        ayurveda_remedies: true,
        homeopathy_remedies: true,
      },
      {
        slug: 'respiratory',
        name: 'Respiratory Health',
        description: 'Natural respiratory support',
        ayurveda_remedies: true,
        homeopathy_remedies: true,
      },
      {
        slug: 'skin-problems',
        name: 'Skin Problems',
        description: 'Natural skin care solutions',
        ayurveda_remedies: true,
        homeopathy_remedies: false,
      },
      {
        slug: 'stress-anxiety',
        name: 'Stress & Anxiety',
        description: 'Natural stress relief',
        ayurveda_remedies: true,
        homeopathy_remedies: true,
      },
    ];

    return { conditions };
  }

  private presentAyurvedaProduct(item: any) {
    const lowestPrice = this.getLowestPrice(item);
    const translation = item.translations?.[0] || {};
    return {
      id: item.id,
      slug: item.slug,
      name: translation.title || item.slug,
      brand: item.brand?.name,
      category: item.category?.name,
      description: translation.description,
      lowest_price: lowestPrice,
      product_type: 'ayurveda',
      is_natural: true,
    };
  }

  private presentHomeopathyProduct(item: any) {
    const lowestPrice = this.getLowestPrice(item);
    const translation = item.translations?.[0] || {};
    return {
      id: item.id,
      slug: item.slug,
      name: translation.title || item.slug,
      brand: item.brand?.name,
      category: item.category?.name,
      description: translation.description,
      lowest_price: lowestPrice,
      product_type: 'homeopathy',
      is_natural: true,
    };
  }

  private getLowestPrice(item: any): number | null {
    let lowest: number | null = null;
    for (const variant of item.variants || []) {
      for (const offer of variant.offers || []) {
        for (const price of offer.prices || []) {
          if (price.isCurrent) {
            const amount = Number(price.sellMinor) / 100;
            if (lowest === null || amount < lowest) {
              lowest = amount;
            }
          }
        }
      }
    }
    return lowest;
  }
}

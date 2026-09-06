import { Injectable } from '@nestjs/common';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { CatalogSearchService, type CatalogSearchHit } from '../catalog/search.service';
import { CatalogService } from '../catalog/catalog.service';
import { CmsSearchService } from '../cms/cms-search.service';
import { Errors } from '../common/problem';
import type { PolicyDocument } from '../policy/empty-pack';
import { PolicyResolver } from '../policy/resolver';
import { ProviderSearchService } from '../search/provider-search.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import {
  DISCOVERY_DEFAULT_LIMIT,
  DISCOVERY_MAX_LIMIT,
  DISCOVERY_MAX_QUERY_LEN,
  SUGGEST_DEFAULT_LIMIT,
  SUGGEST_MAX_LIMIT,
  SUGGEST_MIN_QUERY_LEN,
  decodeDiscoveryCursor,
  encodeDiscoveryCursor,
  type DiscoveryResultItem,
  type DiscoverySearchResponse,
  type DiscoveryType,
  type DiscoveryCommerceSort,
} from './discovery-query';

export interface DiscoverySearchInput {
  countryCode: string;
  locale: string;
  query: string;
  types: DiscoveryType[];
  limit?: number;
  cursor?: string;
  brand?: string;
  category?: string;
  specialty?: string;
  city?: string;
  labOrgId?: string;
  manufacturer?: string;
  rx?: boolean;
  in_stock?: boolean;
  sort?: DiscoveryCommerceSort;
}

@Injectable()
export class DiscoverySearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly catalogSearch: CatalogSearchService,
    private readonly cmsSearch: CmsSearchService,
    private readonly providerSearch: ProviderSearchService,
    private readonly policy: PolicyResolver,
  ) {}

  async search(input: DiscoverySearchInput): Promise<DiscoverySearchResponse> {
    const country = await this.catalog.resolveCountry(input.countryCode);
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    const document = resolved?.document ?? null;
    const flags = await this.catalog.storefrontFlags(country.isoAlpha2);
    const countryEnabled = this.isCountryEnabled(document, flags, input.types);
    const discoveryEnabled = this.policy.isDiscoveryEnabled(document);
    const locale = this.resolveLocale(document, input.locale);
    const query = input.query.trim();
    const limit = Math.min(Math.max(input.limit ?? DISCOVERY_DEFAULT_LIMIT, 1), DISCOVERY_MAX_LIMIT);
    const offset = decodeDiscoveryCursor(input.cursor);

    if (query.length > DISCOVERY_MAX_QUERY_LEN) {
      throw Errors.validation(`Search query must be at most ${DISCOVERY_MAX_QUERY_LEN} characters`);
    }
    if (query && this.policy.isQueryBlocked(document, query)) {
      throw Errors.forbidden('This search query is not allowed.');
    }

    if (!countryEnabled || !discoveryEnabled) {
      return this.emptyResponse(country.isoAlpha2, locale, query, input.types, limit, countryEnabled, discoveryEnabled);
    }
    if (!query) {
      return this.emptyResponse(country.isoAlpha2, locale, query, input.types, limit, true, true);
    }

    const commerceOnly =
      input.types.length === 1 && input.types[0] === 'commerce' && this.isTypeEnabled(document, flags, 'commerce');
    if (commerceOnly) {
      const commercePage = await this.catalogSearch.searchPage(
        country.id,
        query,
        locale,
        limit,
        {
          brand: input.brand,
          category: input.category,
          manufacturer: input.manufacturer,
          rx: input.rx,
          in_stock: input.in_stock,
        },
        input.sort ?? 'relevance',
        input.cursor,
      );
      const page = await this.mapCommerceDocs(country.id, commercePage.data);
      return {
        country: country.isoAlpha2,
        locale,
        country_enabled: true,
        discovery_enabled: true,
        query,
        types: input.types,
        data: page,
        meta: {
          limit,
          total: page.length,
          next_cursor: commercePage.next_cursor,
        },
      };
    }

    const rows: DiscoveryResultItem[] = [];
    const take = limit + offset;
    if (input.types.includes('commerce') && this.isTypeEnabled(document, flags, 'commerce')) {
      rows.push(
        ...(await this.commerceResults(country.id, locale, query, take, {
          brand: input.brand,
          category: input.category,
          manufacturer: input.manufacturer,
          rx: input.rx,
          in_stock: input.in_stock,
          sort: input.sort,
        })),
      );
    }
    if (input.types.includes('help')) {
      rows.push(...(await this.helpResults(country.id, locale, query, take)));
    }
    if (input.types.includes('doctor') && this.isTypeEnabled(document, flags, 'doctor')) {
      rows.push(...(await this.doctorResults(country.id, locale, query, take, input.specialty)));
    }
    if (input.types.includes('lab') && this.isTypeEnabled(document, flags, 'lab')) {
      rows.push(...(await this.labResults(country.id, locale, query, take, input.city)));
    }
    if (input.types.includes('test') && this.isTypeEnabled(document, flags, 'test')) {
      rows.push(...(await this.testResults(country.id, locale, query, take, input.labOrgId, input.category)));
    }
    if (input.types.includes('pharmacy') && this.isTypeEnabled(document, flags, 'pharmacy')) {
      rows.push(...(await this.pharmacyResults(country.id, locale, query, take, input.city)));
    }

    rows.sort((a, b) => a.title.localeCompare(b.title) || a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
    const page = rows.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    const hasMore = rows.length > nextOffset;

    return {
      country: country.isoAlpha2,
      locale,
      country_enabled: true,
      discovery_enabled: true,
      query,
      types: input.types,
      data: page,
      meta: {
        limit,
        total: rows.length,
        next_cursor: hasMore ? encodeDiscoveryCursor(nextOffset) : null,
      },
    };
  }

  async suggest(input: Omit<DiscoverySearchInput, 'cursor' | 'brand' | 'category' | 'specialty' | 'city' | 'labOrgId'>): Promise<DiscoverySearchResponse> {
    const query = input.query.trim();
    if (query.length < SUGGEST_MIN_QUERY_LEN) {
      const country = await this.catalog.resolveCountry(input.countryCode);
      const locale = this.resolveLocale(null, input.locale);
      return this.emptyResponse(country.isoAlpha2, locale, query, input.types, SUGGEST_DEFAULT_LIMIT, true, true);
    }
    return this.search({
      ...input,
      query,
      limit: Math.min(input.limit ?? SUGGEST_DEFAULT_LIMIT, SUGGEST_MAX_LIMIT),
      cursor: undefined,
    });
  }

  private isCountryEnabled(
    document: PolicyDocument | null,
    flags: { pharmacy: boolean; marketplace: boolean; lab: boolean; imaging: boolean },
    types: DiscoveryType[],
  ): boolean {
    const commerceHelpOnly = types.every((type) => type === 'commerce' || type === 'help');
    if (commerceHelpOnly) {
      return flags.pharmacy || flags.marketplace || flags.lab || flags.imaging;
    }
    return this.isCountryEnabledForTypes(document, flags, types);
  }

  private isCountryEnabledForTypes(
    document: PolicyDocument | null,
    flags: { pharmacy: boolean; marketplace: boolean; lab: boolean; imaging: boolean },
    types: DiscoveryType[],
  ): boolean {
    return types.some((type) => this.isTypeEnabled(document, flags, type));
  }

  private isTypeEnabled(
    document: PolicyDocument | null,
    flags: { pharmacy: boolean; marketplace: boolean; lab: boolean; imaging: boolean },
    type: DiscoveryType,
  ): boolean {
    switch (type) {
      case 'commerce':
        return flags.pharmacy || flags.marketplace || flags.lab || flags.imaging;
      case 'help':
        return true;
      case 'doctor':
        return this.policy.areAppointmentsEnabled(document) && this.policy.isDoctorPubliclyVisible(document);
      case 'lab':
      case 'test':
        return (
          flags.lab ||
          this.policy.canUseService(document, 'lab_home') ||
          this.policy.canUseService(document, 'lab_center')
        );
      case 'pharmacy':
        return flags.pharmacy;
      default:
        return false;
    }
  }

  private resolveLocale(document: { i18n?: { locales: string[]; default_locale: string } } | null, requested: string): string {
    const locales = document?.i18n?.locales ?? ['en'];
    const normalized = requested.trim().toLowerCase();
    if (locales.includes(normalized)) {
      return normalized;
    }
    return document?.i18n?.default_locale ?? 'en';
  }

  private emptyResponse(
    country: string,
    locale: string,
    query: string,
    types: DiscoveryType[],
    limit: number,
    countryEnabled: boolean,
    discoveryEnabled: boolean,
  ): DiscoverySearchResponse {
    return {
      country,
      locale,
      country_enabled: countryEnabled,
      discovery_enabled: discoveryEnabled,
      query,
      types,
      data: [],
      meta: { limit, total: 0, next_cursor: null },
    };
  }

  private async commerceResults(
    countryId: string,
    locale: string,
    query: string,
    take: number,
    filters?: {
      brand?: string;
      category?: string;
      manufacturer?: string;
      rx?: boolean;
      in_stock?: boolean;
      sort?: DiscoveryCommerceSort;
    },
  ): Promise<DiscoveryResultItem[]> {
    const docs = await this.catalogSearch.search(countryId, query, locale, take, filters, filters?.sort);
    return this.mapCommerceDocs(countryId, docs);
  }

  private async mapCommerceDocs(countryId: string, docs: CatalogSearchHit[]): Promise<DiscoveryResultItem[]> {
    if (!docs.length) {
      return [];
    }
    const slugs = await this.prisma.catalogItem.findMany({
      where: { id: { in: docs.map((row) => row.itemId) } },
      select: { id: true, slug: true },
    });
    const slugByItemId = new Map(slugs.map((row) => [row.id, row.slug]));
    return docs.map((row) => {
      const slug = slugByItemId.get(row.itemId) ?? null;
      return {
        type: 'commerce' as const,
        id: row.itemId,
        title: row.title,
        subtitle: row.brandName || row.categoryName || null,
        slug,
        href: slug ? `/p/${slug}` : null,
        in_stock: row.inStock,
        rx_required: row.rxRequired,
        min_sell_minor: row.minSellMinor !== null ? row.minSellMinor.toString() : null,
        max_discount_pct: row.maxDiscountPct,
        avg_rating: row.avgRating,
        review_count: row.reviewCount,
        manufacturer: row.manufacturerName || null,
        composition: row.composition || null,
        brand: row.brandName || null,
        category: row.categoryName || null,
      };
    });
  }

  private async helpResults(countryId: string, locale: string, query: string, take: number): Promise<DiscoveryResultItem[]> {
    const rows = await runWithTenant(workerTenantContext({ countryId }), () =>
      this.cmsSearch.search(countryId, locale, query, take),
    );
    return rows.map((row) => ({
      type: 'help' as const,
      id: row.contentItemId,
      title: row.title,
      subtitle: row.categorySlug ?? row.contentType,
      slug: row.slug,
      href: `/help/articles/${row.slug}`,
      content_type: row.contentType,
      category_slug: row.categorySlug,
    }));
  }

  private async doctorResults(
    countryId: string,
    locale: string,
    query: string,
    take: number,
    specialty?: string,
  ): Promise<DiscoveryResultItem[]> {
    const rows = await this.providerSearch.searchDoctors(countryId, locale, query, take, { specialty });
    return rows.map((row) => ({
      type: 'doctor' as const,
      id: row.profileId,
      title: row.title,
      subtitle: row.subtitle,
      slug: null,
      href: `/doctors/${row.profileId}`,
      online_capable: row.onlineCapable,
    }));
  }

  private async labResults(
    countryId: string,
    locale: string,
    query: string,
    take: number,
    city?: string,
  ): Promise<DiscoveryResultItem[]> {
    const rows = await this.providerSearch.searchLabs(countryId, locale, query, take, { city });
    return rows.map((row) => ({
      type: 'lab' as const,
      id: row.organizationId,
      title: row.title,
      subtitle: row.subtitle,
      slug: null,
      href: `/lab`,
      organization_id: row.organizationId,
      city: row.city || null,
    }));
  }

  private async testResults(
    countryId: string,
    locale: string,
    query: string,
    take: number,
    labOrgId?: string,
    category?: string,
  ): Promise<DiscoveryResultItem[]> {
    const rows = await this.providerSearch.searchTests(countryId, locale, query, take, {
      labOrgId,
      category,
    });
    return rows.map((row) => ({
      type: 'test' as const,
      id: row.itemId,
      title: row.title,
      subtitle: row.subtitle,
      slug: row.slug,
      href: `/lab/${row.slug}`,
      lab_org_id: row.labOrgId,
    }));
  }

  private async pharmacyResults(
    countryId: string,
    locale: string,
    query: string,
    take: number,
    city?: string,
  ): Promise<DiscoveryResultItem[]> {
    const rows = await this.providerSearch.searchPharmacies(countryId, locale, query, take, { city });
    return rows.map((row) => ({
      type: 'pharmacy' as const,
      id: row.locationId,
      title: row.title,
      subtitle: row.subtitle,
      slug: null,
      href: `/search`,
      organization_id: row.organizationId,
      location_id: row.locationId,
      city: row.city || null,
    }));
  }
}

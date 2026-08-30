import { Injectable } from '@nestjs/common';
import {
  CatalogItemKind,
  CatalogLifecycle,
  LocationKind,
  OfferOwnership,
  OfferStatus,
  OrganizationKind,
  OrganizationStatus,
  PartnerStatus,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { LabCapabilityService } from '../lab/lab-capability.service';
import type { PolicyDocument } from '../policy/empty-pack';
import { PolicyResolver } from '../policy/resolver';
import { workerTenantContext } from '../tenancy/build-tenant-context';

const MAX_QUERY_LEN = 200;
const MAX_RESULTS = 50;

export interface ProviderDoctorSearchRow {
  profileId: string;
  title: string;
  subtitle: string | null;
  specialties: string;
  onlineCapable: boolean;
}

export interface ProviderLabSearchRow {
  organizationId: string;
  title: string;
  subtitle: string | null;
  city: string;
  region: string;
}

export interface ProviderTestSearchRow {
  itemId: string;
  title: string;
  subtitle: string | null;
  slug: string;
  labOrgId: string | null;
  labName: string;
  categoryName: string;
}

export interface ProviderPharmacySearchRow {
  locationId: string;
  organizationId: string;
  title: string;
  subtitle: string | null;
  city: string;
  region: string;
}

@Injectable()
export class ProviderSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly labCapabilities: LabCapabilityService,
  ) {}

  async reindexDoctor(profileId: string, countryId: string, locale = 'en'): Promise<void> {
    await runWithTenant(workerTenantContext({ countryId }), () =>
      this.reindexDoctorInWorkerContext(profileId, countryId, locale),
    );
  }

  async reindexLab(organizationId: string, countryId: string, locale = 'en'): Promise<void> {
    await runWithTenant(workerTenantContext({ countryId }), () =>
      this.reindexLabInWorkerContext(organizationId, countryId, locale),
    );
  }

  async reindexTest(itemId: string, countryId: string, locale = 'en'): Promise<void> {
    await runWithTenant(workerTenantContext({ countryId }), () =>
      this.reindexTestInWorkerContext(itemId, countryId, locale),
    );
  }

  async reindexPharmacy(locationId: string, countryId: string, locale = 'en'): Promise<void> {
    await runWithTenant(workerTenantContext({ countryId }), () =>
      this.reindexPharmacyInWorkerContext(locationId, countryId, locale),
    );
  }

  async searchDoctors(
    countryId: string,
    locale: string,
    query: string,
    limit = 20,
    filters?: { specialty?: string },
  ): Promise<ProviderDoctorSearchRow[]> {
    const q = this.normalizeQuery(query);
    const take = this.clampLimit(limit);
    const rows = await this.prisma.providerDoctorSearchDocument.findMany({
      where: {
        countryId,
        locale,
        published: true,
        ...(filters?.specialty
          ? { specialties: { contains: filters.specialty, mode: 'insensitive' } }
          : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { subtitle: { contains: q, mode: 'insensitive' } },
                { specialties: { contains: q, mode: 'insensitive' } },
                { body: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take,
      orderBy: [{ onlineCapable: 'desc' }, { title: 'asc' }, { id: 'asc' }],
      select: {
        profileId: true,
        title: true,
        subtitle: true,
        specialties: true,
        onlineCapable: true,
      },
    });
    return rows.map((row) => ({
      profileId: row.profileId,
      title: row.title,
      subtitle: row.subtitle || null,
      specialties: row.specialties,
      onlineCapable: row.onlineCapable,
    }));
  }

  async searchLabs(
    countryId: string,
    locale: string,
    query: string,
    limit = 20,
    filters?: { city?: string },
  ): Promise<ProviderLabSearchRow[]> {
    const q = this.normalizeQuery(query);
    const take = this.clampLimit(limit);
    const rows = await this.prisma.providerLabSearchDocument.findMany({
      where: {
        countryId,
        locale,
        published: true,
        ...(filters?.city ? { city: { equals: filters.city, mode: 'insensitive' } } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { subtitle: { contains: q, mode: 'insensitive' } },
                { city: { contains: q, mode: 'insensitive' } },
                { region: { contains: q, mode: 'insensitive' } },
                { body: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take,
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      select: {
        organizationId: true,
        title: true,
        subtitle: true,
        city: true,
        region: true,
      },
    });
    return rows.map((row) => ({
      organizationId: row.organizationId,
      title: row.title,
      subtitle: row.subtitle || null,
      city: row.city,
      region: row.region,
    }));
  }

  async searchTests(
    countryId: string,
    locale: string,
    query: string,
    limit = 20,
    filters?: { labOrgId?: string; category?: string },
  ): Promise<ProviderTestSearchRow[]> {
    const q = this.normalizeQuery(query);
    const take = this.clampLimit(limit);
    const rows = await this.prisma.providerTestSearchDocument.findMany({
      where: {
        countryId,
        locale,
        published: true,
        ...(filters?.labOrgId ? { labOrgId: filters.labOrgId } : {}),
        ...(filters?.category
          ? { categoryName: { equals: filters.category, mode: 'insensitive' } }
          : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { subtitle: { contains: q, mode: 'insensitive' } },
                { slug: { contains: q, mode: 'insensitive' } },
                { labName: { contains: q, mode: 'insensitive' } },
                { categoryName: { contains: q, mode: 'insensitive' } },
                { body: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take,
      orderBy: [{ title: 'asc' }, { slug: 'asc' }, { id: 'asc' }],
      select: {
        itemId: true,
        title: true,
        subtitle: true,
        slug: true,
        labOrgId: true,
        labName: true,
        categoryName: true,
      },
    });
    return rows.map((row) => ({
      itemId: row.itemId,
      title: row.title,
      subtitle: row.subtitle || null,
      slug: row.slug,
      labOrgId: row.labOrgId,
      labName: row.labName,
      categoryName: row.categoryName,
    }));
  }

  async searchPharmacies(
    countryId: string,
    locale: string,
    query: string,
    limit = 20,
    filters?: { city?: string },
  ): Promise<ProviderPharmacySearchRow[]> {
    const q = this.normalizeQuery(query);
    const take = this.clampLimit(limit);
    const rows = await this.prisma.providerPharmacySearchDocument.findMany({
      where: {
        countryId,
        locale,
        published: true,
        ...(filters?.city ? { city: { equals: filters.city, mode: 'insensitive' } } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { subtitle: { contains: q, mode: 'insensitive' } },
                { city: { contains: q, mode: 'insensitive' } },
                { region: { contains: q, mode: 'insensitive' } },
                { body: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take,
      orderBy: [{ title: 'asc' }, { city: 'asc' }, { id: 'asc' }],
      select: {
        locationId: true,
        organizationId: true,
        title: true,
        subtitle: true,
        city: true,
        region: true,
      },
    });
    return rows.map((row) => ({
      locationId: row.locationId,
      organizationId: row.organizationId,
      title: row.title,
      subtitle: row.subtitle || null,
      city: row.city,
      region: row.region,
    }));
  }

  async backfillDoctors(countryId: string, locale = 'en') {
    const profiles = await this.prisma.doctorProfile.findMany({
      where: { countryId },
      select: { id: true },
    });
    for (const row of profiles) {
      await this.reindexDoctor(row.id, countryId, locale);
    }
    return { scheduled: profiles.length };
  }

  async backfillLabs(countryId: string, locale = 'en') {
    const orgs = await this.prisma.organization.findMany({
      where: { countryId, kind: OrganizationKind.LAB, status: OrganizationStatus.ACTIVE },
      select: { id: true },
    });
    for (const row of orgs) {
      await this.reindexLab(row.id, countryId, locale);
    }
    return { scheduled: orgs.length };
  }

  async backfillTests(countryId: string, locale = 'en') {
    const items = await this.prisma.catalogItemCountry.findMany({
      where: {
        countryId,
        available: true,
        item: { kind: CatalogItemKind.LAB_TEST, status: CatalogLifecycle.PUBLISHED },
      },
      select: { itemId: true },
    });
    for (const row of items) {
      await this.reindexTest(row.itemId, countryId, locale);
    }
    return { scheduled: items.length };
  }

  async backfillPharmacies(countryId: string, locale = 'en') {
    const locations = await this.prisma.location.findMany({
      where: {
        countryId,
        isActive: true,
        kind: { in: [LocationKind.STORE, LocationKind.COLLECTION_POINT] },
        organization: { kind: OrganizationKind.PHARMACY_OWNED, status: OrganizationStatus.ACTIVE },
      },
      select: { id: true },
    });
    for (const row of locations) {
      await this.reindexPharmacy(row.id, countryId, locale);
    }
    return { scheduled: locations.length };
  }

  async backfillAll(countryId: string, locale = 'en') {
    const [doctors, labs, tests, pharmacies] = await Promise.all([
      this.backfillDoctors(countryId, locale),
      this.backfillLabs(countryId, locale),
      this.backfillTests(countryId, locale),
      this.backfillPharmacies(countryId, locale),
    ]);
    return {
      doctors: doctors.scheduled,
      labs: labs.scheduled,
      tests: tests.scheduled,
      pharmacies: pharmacies.scheduled,
    };
  }

  private async reindexDoctorInWorkerContext(profileId: string, countryId: string, locale: string) {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { id: profileId },
      include: { partner: true, country: true },
    });
    if (!profile || profile.countryId !== countryId) {
      return;
    }
    const resolved = await this.policy.resolvePublished(profile.country.isoAlpha2);
    const document = resolved?.document ?? null;
    const published =
      profile.partner.status === PartnerStatus.ACTIVE &&
      profile.partner.partnerTypeCode === 'DOCTOR' &&
      this.policy.areAppointmentsEnabled(document) &&
      this.policy.isDoctorPubliclyVisible(document);
    const specialties = this.stringifyJsonArray(profile.specialties);
    const title = profile.displayName || profile.professionalName || 'Doctor';
    const subtitle = specialties || null;
    const body = (profile.bio ?? '').slice(0, 2000);
    await this.prisma.providerDoctorSearchDocument.upsert({
      where: { profileId_countryId_locale: { profileId, countryId, locale } },
      create: {
        id: uuidv7(),
        profileId,
        countryId,
        locale,
        title,
        subtitle: subtitle ?? '',
        body,
        specialties,
        onlineCapable: profile.onlineCapable,
        published,
        version: 0,
      },
      update: {
        title,
        subtitle: subtitle ?? '',
        body,
        specialties,
        onlineCapable: profile.onlineCapable,
        published,
        version: { increment: 1 },
      },
    });
  }

  private async reindexLabInWorkerContext(organizationId: string, countryId: string, locale: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { country: true, locations: { where: { isActive: true, kind: LocationKind.LAB }, take: 1 } },
    });
    if (!org || org.countryId !== countryId || org.kind !== OrganizationKind.LAB) {
      return;
    }
    const resolved = await this.policy.resolvePublished(org.country.isoAlpha2);
    const document = resolved?.document ?? null;
    const elig = await this.labCapabilities.evaluate(organizationId);
    const published =
      org.status === OrganizationStatus.ACTIVE &&
      this.isLabDiscoveryEnabled(document) &&
      elig.state === 'ELIGIBLE' &&
      elig.booking_enabled;
    const location = org.locations[0];
    const city = location?.city ?? '';
    const region = location?.region ?? '';
    const subtitle = [city, region].filter(Boolean).join(', ');
    await this.prisma.providerLabSearchDocument.upsert({
      where: { organizationId_countryId_locale: { organizationId, countryId, locale } },
      create: {
        id: uuidv7(),
        organizationId,
        countryId,
        locale,
        title: org.displayName,
        subtitle,
        body: org.legalName.slice(0, 500),
        city,
        region,
        published,
        version: 0,
      },
      update: {
        title: org.displayName,
        subtitle,
        body: org.legalName.slice(0, 500),
        city,
        region,
        published,
        version: { increment: 1 },
      },
    });
  }

  private async reindexTestInWorkerContext(itemId: string, countryId: string, locale: string) {
    const item = await this.prisma.catalogItem.findUnique({
      where: { id: itemId },
      include: {
        translations: true,
        category: true,
        countries: true,
        variants: {
          include: {
            offers: {
              where: {
                countryId,
                status: OfferStatus.PUBLISHED,
                ownership: OfferOwnership.LAB_OWNED,
              },
              include: { sellerOrg: true, prices: { where: { isCurrent: true }, take: 1 } },
            },
          },
        },
      },
    });
    if (!item || item.kind !== CatalogItemKind.LAB_TEST) {
      return;
    }
    const country = await this.prisma.country.findUnique({ where: { id: countryId } });
    if (!country) {
      return;
    }
    const resolved = await this.policy.resolvePublished(country.isoAlpha2);
    const document = resolved?.document ?? null;
    const assortment = item.countries.find((row) => row.countryId === countryId);
    const offer = item.variants.flatMap((variant) => variant.offers).find((row) => row.sellerOrg.kind === OrganizationKind.LAB);
    let published = false;
    let labOrgId: string | null = null;
    let labName = '';
    if (
      item.status === CatalogLifecycle.PUBLISHED &&
      assortment?.available === true &&
      offer &&
      offer.sellerOrg.status === OrganizationStatus.ACTIVE &&
      this.isLabDiscoveryEnabled(document)
    ) {
      const elig = await this.labCapabilities.evaluate(offer.sellerOrgId);
      published = elig.state === 'ELIGIBLE' && elig.booking_enabled;
      labOrgId = offer.sellerOrgId;
      labName = offer.sellerOrg.displayName;
    }
    const translation = item.translations.find((row) => row.locale === locale) ?? item.translations[0];
    const title = translation?.title ?? item.slug;
    const body = (translation?.description ?? '').slice(0, 2000);
    const categoryName = item.category?.name ?? '';
    const subtitle = labName || categoryName || null;
    await this.prisma.providerTestSearchDocument.upsert({
      where: { itemId_countryId_locale: { itemId, countryId, locale } },
      create: {
        id: uuidv7(),
        itemId,
        countryId,
        locale,
        title,
        subtitle: subtitle ?? '',
        body,
        slug: item.slug,
        labOrgId,
        labName,
        categoryName,
        published,
        version: 0,
      },
      update: {
        title,
        subtitle: subtitle ?? '',
        body,
        slug: item.slug,
        labOrgId,
        labName,
        categoryName,
        published,
        version: { increment: 1 },
      },
    });
    if (labOrgId) {
      await this.reindexLabInWorkerContext(labOrgId, countryId, locale);
    }
  }

  private async reindexPharmacyInWorkerContext(locationId: string, countryId: string, locale: string) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      include: { organization: { include: { country: true } } },
    });
    if (!location || location.countryId !== countryId) {
      return;
    }
    const org = location.organization;
    const resolved = await this.policy.resolvePublished(org.country.isoAlpha2);
    const document = resolved?.document ?? null;
    const published =
      location.isActive &&
      (location.kind === LocationKind.STORE || location.kind === LocationKind.COLLECTION_POINT) &&
      org.kind === OrganizationKind.PHARMACY_OWNED &&
      org.status === OrganizationStatus.ACTIVE &&
      this.policy.canUseService(document, 'pharmacy');
    const city = location.city ?? '';
    const region = location.region ?? '';
    const subtitle = [city, region].filter(Boolean).join(', ');
    const body = (location.addressLine ?? '').slice(0, 500);
    await this.prisma.providerPharmacySearchDocument.upsert({
      where: { locationId_countryId_locale: { locationId, countryId, locale } },
      create: {
        id: uuidv7(),
        organizationId: org.id,
        locationId,
        countryId,
        locale,
        title: location.name,
        subtitle,
        body,
        city,
        region,
        published,
        version: 0,
      },
      update: {
        organizationId: org.id,
        title: location.name,
        subtitle,
        body,
        city,
        region,
        published,
        version: { increment: 1 },
      },
    });
  }

  private isLabDiscoveryEnabled(document: PolicyDocument | null): boolean {
    return (
      this.policy.canUseService(document, 'lab_home') || this.policy.canUseService(document, 'lab_center')
    );
  }

  private stringifyJsonArray(value: unknown): string {
    if (!Array.isArray(value)) {
      return '';
    }
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .join(', ');
  }

  private normalizeQuery(query: string): string {
    const q = query.trim();
    if (!q) {
      return '';
    }
    if (q.length > MAX_QUERY_LEN) {
      throw Errors.validation(`Search query must be at most ${MAX_QUERY_LEN} characters`);
    }
    return q;
  }

  private clampLimit(limit: number): number {
    return Math.min(Math.max(limit, 1), MAX_RESULTS);
  }
}

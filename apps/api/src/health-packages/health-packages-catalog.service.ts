import { Injectable, OnModuleInit } from '@nestjs/common';
import { HealthPackageStatus } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { SecurityEventsService } from '../identity/security-events.service';

type PackageInput = {
  code: string;
  name: string;
  description?: string;
  category: string;
  price_minor: number;
  original_price_minor?: number;
  currency: string;
  tests_count?: number;
  requires_fasting?: boolean;
  report_turnaround?: string;
  is_popular?: boolean;
  suitable_for?: string[];
  age_groups?: string[];
  included_services?: unknown[];
  eligibility_notes?: string;
  validity_days?: number;
};

@Injectable()
export class HealthPackagesCatalogService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: SecurityEventsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const countries = await this.prisma.country.findMany({
      where: { isoAlpha2: { in: ['IN', 'AE', 'US'] }, status: 'ACTIVE' },
    });
    for (const country of countries) {
      await this.ensureSandboxSeed(country.id, country.defaultCurrency);
    }
  }

  private present(row: {
    id: string;
    code: string;
    name: string;
    description: string;
    category: string;
    priceMinor: number;
    originalPriceMinor: number | null;
    currency: string;
    testsCount: number;
    requiresFasting: boolean;
    reportTurnaround: string | null;
    isPopular: boolean;
    suitableFor: string[];
    ageGroups: string[];
    includedServices: unknown;
    eligibilityNotes: string | null;
    validityDays: number | null;
    status: HealthPackageStatus;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    archivedAt: Date | null;
  }) {
    const discount =
      row.originalPriceMinor && row.originalPriceMinor > row.priceMinor
        ? Math.round((1 - row.priceMinor / row.originalPriceMinor) * 100)
        : 0;
    return {
      id: row.code,
      package_id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      category: row.category,
      price: row.priceMinor / 100,
      price_minor: row.priceMinor,
      original_price: row.originalPriceMinor ? row.originalPriceMinor / 100 : null,
      original_price_minor: row.originalPriceMinor,
      currency: row.currency,
      discount,
      suitable_for: row.suitableFor,
      age_groups: row.ageGroups,
      tests_count: row.testsCount,
      requires_fasting: row.requiresFasting,
      report_turnaround: row.reportTurnaround,
      is_popular: row.isPopular,
      included_services: row.includedServices,
      eligibility_notes: row.eligibilityNotes,
      validity_days: row.validityDays,
      status: row.status,
      version: row.version,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      archived_at: row.archivedAt?.toISOString() ?? null,
    };
  }

  async listAdmin(countryCode: string, filters?: { search?: string; status?: string }) {
    const country = await this.requireCountry(countryCode);
    const rows = await this.prisma.healthPackage.findMany({
      where: {
        countryId: country.id,
        ...(filters?.status ? { status: filters.status as HealthPackageStatus } : {}),
        ...(filters?.search
          ? {
              OR: [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { code: { contains: filters.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      take: 100,
    });
    return { packages: rows.map((row) => this.present(row)), total: rows.length };
  }

  async getAdmin(countryCode: string, code: string) {
    const country = await this.requireCountry(countryCode);
    const row = await this.prisma.healthPackage.findUnique({
      where: { countryId_code: { countryId: country.id, code } },
    });
    if (!row) {
      throw Errors.notFound('Health package not found');
    }
    const audits = await this.prisma.securityEvent.findMany({
      where: { type: 'HEALTH_PACKAGE_MUTATED', metadata: { path: ['package_id'], equals: row.id } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return {
      ...this.present(row),
      audit: audits.map((a) => ({
        id: a.id,
        at: a.createdAt.toISOString(),
        metadata: a.metadata,
      })),
    };
  }

  async create(actorId: string, countryCode: string, input: PackageInput) {
    const country = await this.requireCountry(countryCode);
    const row = await this.prisma.healthPackage.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        code: input.code,
        name: input.name,
        description: input.description ?? '',
        category: input.category,
        priceMinor: input.price_minor,
        originalPriceMinor: input.original_price_minor,
        currency: input.currency || country.defaultCurrency,
        testsCount: input.tests_count ?? 0,
        requiresFasting: input.requires_fasting ?? true,
        reportTurnaround: input.report_turnaround,
        isPopular: input.is_popular ?? false,
        suitableFor: input.suitable_for ?? [],
        ageGroups: input.age_groups ?? [],
        includedServices: (input.included_services ?? []) as object,
        eligibilityNotes: input.eligibility_notes,
        validityDays: input.validity_days,
        status: HealthPackageStatus.DRAFT,
      },
    });
    await this.audit(actorId, row.id, 'CREATE', { code: row.code });
    return this.present(row);
  }

  async update(actorId: string, countryCode: string, code: string, input: Partial<PackageInput>) {
    const country = await this.requireCountry(countryCode);
    const existing = await this.prisma.healthPackage.findUnique({
      where: { countryId_code: { countryId: country.id, code } },
    });
    if (!existing) {
      throw Errors.notFound('Health package not found');
    }
    const row = await this.prisma.healthPackage.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.price_minor !== undefined ? { priceMinor: input.price_minor } : {}),
        ...(input.original_price_minor !== undefined ? { originalPriceMinor: input.original_price_minor } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.tests_count !== undefined ? { testsCount: input.tests_count } : {}),
        ...(input.requires_fasting !== undefined ? { requiresFasting: input.requires_fasting } : {}),
        ...(input.report_turnaround !== undefined ? { reportTurnaround: input.report_turnaround } : {}),
        ...(input.is_popular !== undefined ? { isPopular: input.is_popular } : {}),
        ...(input.suitable_for !== undefined ? { suitableFor: input.suitable_for } : {}),
        ...(input.age_groups !== undefined ? { ageGroups: input.age_groups } : {}),
        ...(input.included_services !== undefined ? { includedServices: input.included_services as object } : {}),
        ...(input.eligibility_notes !== undefined ? { eligibilityNotes: input.eligibility_notes } : {}),
        ...(input.validity_days !== undefined ? { validityDays: input.validity_days } : {}),
        version: { increment: 1 },
      },
    });
    await this.audit(actorId, row.id, 'UPDATE', { code: row.code });
    return this.present(row);
  }

  async setStatus(actorId: string, countryCode: string, code: string, status: HealthPackageStatus) {
    const country = await this.requireCountry(countryCode);
    const existing = await this.prisma.healthPackage.findUnique({
      where: { countryId_code: { countryId: country.id, code } },
    });
    if (!existing) {
      throw Errors.notFound('Health package not found');
    }
    const row = await this.prisma.healthPackage.update({
      where: { id: existing.id },
      data: {
        status,
        archivedAt: status === HealthPackageStatus.ARCHIVED ? new Date() : null,
        version: { increment: 1 },
      },
    });
    await this.audit(actorId, row.id, 'STATUS', { code: row.code, status });
    return this.present(row);
  }

  async listPublic(countryCode: string, filters: Record<string, string | number | undefined>) {
    const country = await this.requireCountry(countryCode);
    let rows = await this.prisma.healthPackage.findMany({
      where: { countryId: country.id, status: HealthPackageStatus.ACTIVE },
      orderBy: { name: 'asc' },
    });
    if (filters.category) {
      rows = rows.filter((r) => r.category === filters.category);
    }
    if (filters.search) {
      const q = String(filters.search).toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
    }
    const limit = Math.min(50, Math.max(1, Number(filters.limit) || 20));
    return { packages: rows.slice(0, limit).map((r) => this.present(r)), total: rows.length };
  }

  async getPublic(countryCode: string, code: string) {
    const country = await this.requireCountry(countryCode);
    const row = await this.prisma.healthPackage.findFirst({
      where: { countryId: country.id, code, status: HealthPackageStatus.ACTIVE },
    });
    if (!row) {
      throw Errors.notFound('Health package not found');
    }
    return this.present(row);
  }

  private async requireCountry(countryCode: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country_code is required');
    }
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: countryCode.trim().toUpperCase() },
    });
    if (!country) {
      throw Errors.notFound('Country not available');
    }
    return country;
  }

  private async audit(actorId: string, packageId: string, action: string, metadata: Record<string, unknown>) {
    await this.events.emit({
      type: 'HEALTH_PACKAGE_MUTATED',
      outcome: 'success',
      personId: actorId,
      metadata: { package_id: packageId, action, ...metadata },
    });
  }

  private async ensureSandboxSeed(countryId: string, currency: string) {
    const count = await this.prisma.healthPackage.count({ where: { countryId } });
    if (count > 0) {
      return;
    }
    const seeds: PackageInput[] = [
      {
        code: 'full-body-basic',
        name: 'Full Body Checkup - Basic',
        description: 'Comprehensive basic health screening for overall wellness',
        category: 'full-body',
        price_minor: currency === 'USD' ? 4999 : currency === 'AED' ? 19900 : 149900,
        original_price_minor: currency === 'USD' ? 9999 : currency === 'AED' ? 39900 : 299900,
        currency,
        tests_count: 65,
        is_popular: true,
        suitable_for: ['male', 'female', 'other'],
        age_groups: ['adult', 'senior'],
        report_turnaround: '24-48 hours',
      },
      {
        code: 'diabetes-basic',
        name: 'Diabetes Screening - Basic',
        description: 'Essential diabetes screening package',
        category: 'diabetes',
        price_minor: currency === 'USD' ? 1999 : currency === 'AED' ? 7900 : 59900,
        original_price_minor: currency === 'USD' ? 3999 : currency === 'AED' ? 15900 : 119900,
        currency,
        tests_count: 25,
        suitable_for: ['male', 'female', 'other'],
        age_groups: ['adult', 'senior'],
        report_turnaround: '24 hours',
      },
    ];
    for (const seed of seeds) {
      await this.prisma.healthPackage.create({
        data: {
          id: uuidv7(),
          countryId,
          code: seed.code,
          name: seed.name,
          description: seed.description ?? '',
          category: seed.category,
          priceMinor: seed.price_minor,
          originalPriceMinor: seed.original_price_minor,
          currency: seed.currency,
          testsCount: seed.tests_count ?? 0,
          requiresFasting: true,
          reportTurnaround: seed.report_turnaround,
          isPopular: seed.is_popular ?? false,
          suitableFor: seed.suitable_for ?? [],
          ageGroups: seed.age_groups ?? [],
          includedServices: [],
          status: HealthPackageStatus.ACTIVE,
        },
      });
    }
  }
}

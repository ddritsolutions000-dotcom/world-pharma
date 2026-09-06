import { Injectable, OnModuleInit } from '@nestjs/common';
import { CarePlanCatalogStatus } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService, runWithTenant } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { SecurityEventsService } from '../identity/security-events.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { tenantAls } from '../tenancy/tenant-als';

export type CarePlanView = {
  id: string;
  name: string;
  price_label: string;
  price_minor: string;
  currency: string;
  period: string;
  discount_bps: number;
  free_delivery: boolean;
  featured: boolean;
  perks: string[];
  description?: string;
  status?: string;
  eligibility_notes?: string;
  effective_from?: string | null;
  effective_to?: string | null;
  version?: number;
};

@Injectable()
export class CarePlanDefinitionService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: SecurityEventsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const countries = await this.prisma.country.findMany({
      where: { isoAlpha2: { in: ['IN', 'AE', 'US'] }, status: 'ACTIVE' },
    });
    for (const country of countries) {
      await this.ensureSeed(country.id, country.defaultCurrency);
    }
  }

  present(row: {
    planCode: string;
    name: string;
    description: string;
    priceMinor: number;
    currency: string;
    period: string;
    discountBps: number;
    freeDelivery: boolean;
    featured: boolean;
    perks: unknown;
    status: CarePlanCatalogStatus;
    eligibilityNotes: string | null;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
    version: number;
  }): CarePlanView {
    const symbol = row.currency === 'USD' ? '$' : row.currency === 'AED' ? 'AED ' : '₹';
    const major = row.priceMinor / 100;
    return {
      id: row.planCode,
      name: row.name,
      description: row.description,
      price_label: `${symbol}${major}/${row.period}`,
      price_minor: String(row.priceMinor),
      currency: row.currency,
      period: row.period,
      discount_bps: row.discountBps,
      free_delivery: row.freeDelivery,
      featured: row.featured,
      perks: Array.isArray(row.perks) ? (row.perks as string[]) : [],
      status: row.status,
      eligibility_notes: row.eligibilityNotes ?? undefined,
      effective_from: row.effectiveFrom?.toISOString() ?? null,
      effective_to: row.effectiveTo?.toISOString() ?? null,
      version: row.version,
    };
  }

  async listCatalog(countryCode: string) {
    const country = await this.requireCountry(countryCode);
    return this.withCountryWorker(country.id, async () => {
      const rows = await this.prisma.carePlanDefinition.findMany({
        where: { countryId: country.id, status: CarePlanCatalogStatus.ACTIVE },
        orderBy: { name: 'asc' },
      });
      return rows.map((r) => this.present(r));
    });
  }

  async listAdmin(countryCode: string) {
    const country = await this.requireCountry(countryCode);
    return this.withCountryWorker(country.id, async () => {
      const rows = await this.prisma.carePlanDefinition.findMany({
        where: { countryId: country.id },
        orderBy: { planCode: 'asc' },
      });
      return { data: rows.map((r) => this.present(r)) };
    });
  }

  async getByCode(countryCode: string, planCode: string) {
    const country = await this.requireCountry(countryCode);
    return this.withCountryWorker(country.id, async () => {
      const row = await this.prisma.carePlanDefinition.findUnique({
        where: { countryId_planCode: { countryId: country.id, planCode } },
      });
      if (!row) {
        return null;
      }
      return this.present(row);
    });
  }

  async create(actorId: string, countryCode: string, input: Record<string, unknown>) {
    const country = await this.requireCountry(countryCode);
    return this.withCountryWorker(country.id, async () => {
      const row = await this.prisma.carePlanDefinition.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        planCode: String(input.plan_code ?? input.id),
        name: String(input.name),
        description: String(input.description ?? ''),
        priceMinor: Number(input.price_minor),
        currency: String(input.currency ?? country.defaultCurrency),
        period: String(input.period ?? 'year'),
        discountBps: Number(input.discount_bps ?? 0),
        freeDelivery: Boolean(input.free_delivery),
        featured: Boolean(input.featured),
        perks: input.perks ?? [],
        eligibilityNotes: input.eligibility_notes ? String(input.eligibility_notes) : null,
        status: CarePlanCatalogStatus.DRAFT,
      },
    });
      await this.events.emit({
        type: 'CARE_PLAN_CATALOG_MUTATED',
        outcome: 'success',
        personId: actorId,
        metadata: { plan_code: row.planCode, action: 'CREATE' },
      });
      return this.present(row);
    });
  }

  async update(actorId: string, countryCode: string, planCode: string, input: Record<string, unknown>) {
    const country = await this.requireCountry(countryCode);
    return this.withCountryWorker(country.id, async () => {
      const existing = await this.prisma.carePlanDefinition.findUnique({
        where: { countryId_planCode: { countryId: country.id, planCode } },
      });
      if (!existing) {
        throw Errors.notFound('Care plan not found');
      }
      const row = await this.prisma.carePlanDefinition.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: String(input.name) } : {}),
        ...(input.description !== undefined ? { description: String(input.description) } : {}),
        ...(input.price_minor !== undefined ? { priceMinor: Number(input.price_minor) } : {}),
        ...(input.discount_bps !== undefined ? { discountBps: Number(input.discount_bps) } : {}),
        ...(input.free_delivery !== undefined ? { freeDelivery: Boolean(input.free_delivery) } : {}),
        ...(input.featured !== undefined ? { featured: Boolean(input.featured) } : {}),
        ...(input.perks !== undefined ? { perks: input.perks as object } : {}),
        version: { increment: 1 },
      },
    });
      await this.events.emit({
        type: 'CARE_PLAN_CATALOG_MUTATED',
        outcome: 'success',
        personId: actorId,
        metadata: { plan_code: row.planCode, action: 'UPDATE' },
      });
      return this.present(row);
    });
  }

  async setStatus(actorId: string, countryCode: string, planCode: string, status: CarePlanCatalogStatus) {
    const country = await this.requireCountry(countryCode);
    return this.withCountryWorker(country.id, async () => {
      const existing = await this.prisma.carePlanDefinition.findUnique({
        where: { countryId_planCode: { countryId: country.id, planCode } },
      });
      if (!existing) {
        throw Errors.notFound('Care plan not found');
      }
      const row = await this.prisma.carePlanDefinition.update({
      where: { id: existing.id },
      data: { status, version: { increment: 1 } },
    });
      await this.events.emit({
        type: 'CARE_PLAN_CATALOG_MUTATED',
        outcome: 'success',
        personId: actorId,
        metadata: { plan_code: row.planCode, action: 'STATUS', status },
      });
      return this.present(row);
    });
  }

  private withCountryWorker<T>(countryId: string, fn: () => Promise<T>): Promise<T> {
    const store = tenantAls.getStore();
    if (store?.ctx.actorKind === 'worker' && store.ctx.countryIds.includes(countryId)) {
      return fn();
    }
    return runWithTenant(workerTenantContext({ countryId }), fn);
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

  private async ensureSeed(countryId: string, currency: string) {
    await this.withCountryWorker(countryId, async () => {
      const count = await this.prisma.carePlanDefinition.count({ where: { countryId } });
      if (count > 0) {
        return;
      }
      const price = currency === 'USD' ? 999 : currency === 'AED' ? 3999 : 54900;
      const seeds = [
        {
          planCode: 'diabetes',
          name: 'Diabetes Care Plan',
          priceMinor: price,
          discountBps: 1500,
          featured: true,
          perks: ['15% off medicines at checkout', 'Doctor consults at member rate', 'Priority support'],
        },
        {
          planCode: 'family',
          name: 'Family Health Plan',
          priceMinor: Math.round(price * 1.8),
          discountBps: 1000,
          freeDelivery: true,
          perks: ['10% off all orders', 'Free delivery on pharmacy orders', 'Family profiles included'],
        },
      ];
      for (const seed of seeds) {
        await this.prisma.carePlanDefinition.create({
          data: {
            id: uuidv7(),
            countryId,
            planCode: seed.planCode,
            name: seed.name,
            description: `${seed.name} — sandbox membership`,
            priceMinor: seed.priceMinor,
            currency,
            discountBps: seed.discountBps,
            freeDelivery: seed.freeDelivery ?? false,
            featured: seed.featured ?? false,
            perks: seed.perks,
            status: CarePlanCatalogStatus.ACTIVE,
          },
        });
      }
    });
  }
}

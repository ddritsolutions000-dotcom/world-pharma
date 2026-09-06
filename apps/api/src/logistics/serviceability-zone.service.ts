import { Injectable, OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { SecurityEventsService } from '../identity/security-events.service';
import { IN_PINCODES, type ServiceabilityResult, resolveServiceability } from './serviceability';

export type ServiceabilityZoneView = {
  id: string;
  country_code: string;
  name: string;
  postal_prefix: string | null;
  postal_from: string | null;
  postal_to: string | null;
  city: string | null;
  region: string | null;
  medicine_delivery: boolean;
  lab_home_collection: boolean;
  express_delivery: boolean;
  cod_available: boolean;
  carrier_code: string | null;
  priority: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type ZoneRow = {
  id: string;
  countryId: string;
  name: string;
  postalPrefix: string | null;
  postalFrom: string | null;
  postalTo: string | null;
  city: string | null;
  region: string | null;
  medicineDelivery: boolean;
  labHomeCollection: boolean;
  expressDelivery: boolean;
  codAvailable: boolean;
  carrierCode: string | null;
  priority: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  country: { isoAlpha2: string };
};

@Injectable()
export class ServiceabilityZoneService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: SecurityEventsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const countries = await this.prisma.country.findMany({
      where: { isoAlpha2: { in: ['IN', 'AE', 'US'] }, status: 'ACTIVE' },
    });
    for (const country of countries) {
      const count = await this.prisma.serviceabilityZone.count({ where: { countryId: country.id } });
      if (count > 0) {
        continue;
      }
      if (country.isoAlpha2 === 'IN') {
        for (const [postal, meta] of Object.entries(IN_PINCODES)) {
          await this.prisma.serviceabilityZone.create({
            data: {
              id: uuidv7(),
              countryId: country.id,
              name: `${meta.city} metro`,
              postalPrefix: postal,
              city: meta.city,
              region: meta.region,
              medicineDelivery: true,
              labHomeCollection: true,
              expressDelivery: true,
              codAvailable: true,
              priority: 10,
              active: true,
            },
          });
        }
      } else {
        await this.prisma.serviceabilityZone.create({
          data: {
            id: uuidv7(),
            countryId: country.id,
            name: `${country.isoAlpha2} default zone`,
            postalFrom: '10000',
            postalTo: '99999',
            medicineDelivery: true,
            labHomeCollection: true,
            expressDelivery: false,
            codAvailable: country.isoAlpha2 === 'AE',
            priority: 100,
            active: true,
          },
        });
      }
    }
  }

  private present(row: ZoneRow): ServiceabilityZoneView {
    return {
      id: row.id,
      country_code: row.country.isoAlpha2,
      name: row.name,
      postal_prefix: row.postalPrefix,
      postal_from: row.postalFrom,
      postal_to: row.postalTo,
      city: row.city,
      region: row.region,
      medicine_delivery: row.medicineDelivery,
      lab_home_collection: row.labHomeCollection,
      express_delivery: row.expressDelivery,
      cod_available: row.codAvailable,
      carrier_code: row.carrierCode,
      priority: row.priority,
      active: row.active,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  async list(countryCode: string) {
    const country = await this.requireCountry(countryCode);
    const rows = await this.prisma.serviceabilityZone.findMany({
      where: { countryId: country.id },
      include: { country: true },
      orderBy: [{ active: 'desc' }, { priority: 'asc' }, { name: 'asc' }],
      take: 200,
    });
    return { data: rows.map((row) => this.present(row as ZoneRow)) };
  }

  async create(actorId: string, countryCode: string, input: Record<string, unknown>) {
    const country = await this.requireCountry(countryCode);
    const row = await this.prisma.serviceabilityZone.create({
      data: {
        id: uuidv7(),
        countryId: country.id,
        name: String(input.name ?? 'Zone'),
        postalPrefix: input.postal_prefix ? String(input.postal_prefix) : null,
        postalFrom: input.postal_from ? String(input.postal_from) : null,
        postalTo: input.postal_to ? String(input.postal_to) : null,
        city: input.city ? String(input.city) : null,
        region: input.region ? String(input.region) : null,
        medicineDelivery: input.medicine_delivery !== false,
        labHomeCollection: input.lab_home_collection === true,
        expressDelivery: input.express_delivery === true,
        codAvailable: input.cod_available === true,
        carrierCode: input.carrier_code ? String(input.carrier_code) : null,
        priority: Number(input.priority ?? 100),
        active: input.active !== false,
      },
      include: { country: true },
    });
    await this.events.emit({
      type: 'SERVICEABILITY_ZONE_MUTATED',
      outcome: 'success',
      personId: actorId,
      metadata: { zone_id: row.id, action: 'CREATE', country_code: country.isoAlpha2 },
    });
    return this.present(row as ZoneRow);
  }

  async update(actorId: string, zoneId: string, input: Record<string, unknown>) {
    const existing = await this.prisma.serviceabilityZone.findUnique({
      where: { id: zoneId },
      include: { country: true },
    });
    if (!existing) {
      throw Errors.notFound('Serviceability zone not found');
    }
    const row = await this.prisma.serviceabilityZone.update({
      where: { id: zoneId },
      data: {
        ...(input.name !== undefined ? { name: String(input.name) } : {}),
        ...(input.postal_prefix !== undefined ? { postalPrefix: input.postal_prefix ? String(input.postal_prefix) : null } : {}),
        ...(input.postal_from !== undefined ? { postalFrom: input.postal_from ? String(input.postal_from) : null } : {}),
        ...(input.postal_to !== undefined ? { postalTo: input.postal_to ? String(input.postal_to) : null } : {}),
        ...(input.city !== undefined ? { city: input.city ? String(input.city) : null } : {}),
        ...(input.region !== undefined ? { region: input.region ? String(input.region) : null } : {}),
        ...(input.medicine_delivery !== undefined ? { medicineDelivery: Boolean(input.medicine_delivery) } : {}),
        ...(input.lab_home_collection !== undefined ? { labHomeCollection: Boolean(input.lab_home_collection) } : {}),
        ...(input.express_delivery !== undefined ? { expressDelivery: Boolean(input.express_delivery) } : {}),
        ...(input.cod_available !== undefined ? { codAvailable: Boolean(input.cod_available) } : {}),
        ...(input.carrier_code !== undefined ? { carrierCode: input.carrier_code ? String(input.carrier_code) : null } : {}),
        ...(input.priority !== undefined ? { priority: Number(input.priority) } : {}),
        ...(input.active !== undefined ? { active: Boolean(input.active) } : {}),
      },
      include: { country: true },
    });
    await this.events.emit({
      type: 'SERVICEABILITY_ZONE_MUTATED',
      outcome: 'success',
      personId: actorId,
      metadata: { zone_id: row.id, action: 'UPDATE' },
    });
    return this.present(row as ZoneRow);
  }

  /** Authoritative medicine-delivery gate for checkout (uses DB zones, then policy fallback). */
  async assertMedicineDelivery(countryCode: string, postalCode: string): Promise<ServiceabilityResult> {
    const result = await this.check(countryCode, postalCode);
    if (!result.serviceable || !result.medicine_delivery) {
      throw Errors.problem(
        422,
        'NOT_SERVICEABLE',
        'Not serviceable',
        result.message || 'Medicine delivery is not available for this destination.',
      );
    }
    return result;
  }

  async check(countryCode: string, postalCode: string): Promise<ServiceabilityResult> {
    const country = await this.requireCountry(countryCode);
    const postal = (postalCode || '').trim();
    if (!postal) {
      return resolveServiceability(country.isoAlpha2, '');
    }
    const zones = await this.prisma.serviceabilityZone.findMany({
      where: { countryId: country.id, active: true },
      orderBy: { priority: 'asc' },
    });
    const matched = zones.find((zone) => this.postalMatches(postal, zone));
    if (matched) {
      return {
        serviceable: true,
        city: matched.city,
        region: matched.region,
        country_code: country.isoAlpha2,
        postal_code: postal,
        medicine_delivery: matched.medicineDelivery,
        lab_home_collection: matched.labHomeCollection,
        express_delivery: matched.expressDelivery,
        medicine_eta: matched.expressDelivery ? 'same_day' : 'next_day',
        lab_eta: matched.labHomeCollection ? 'next_day' : 'unavailable',
        message: matched.city ? `Delivering to ${matched.city}` : `Zone: ${matched.name}`,
      };
    }
    return resolveServiceability(country.isoAlpha2, postal);
  }

  private postalMatches(postal: string, zone: {
    postalPrefix: string | null;
    postalFrom: string | null;
    postalTo: string | null;
  }): boolean {
    if (zone.postalPrefix && postal.startsWith(zone.postalPrefix)) {
      return true;
    }
    if (zone.postalFrom && zone.postalTo && postal >= zone.postalFrom && postal <= zone.postalTo) {
      return true;
    }
    return false;
  }

  private async requireCountry(countryCode: string) {
    if (!countryCode?.trim()) {
      throw Errors.validation('country is required');
    }
    const country = await this.prisma.country.findUnique({
      where: { isoAlpha2: countryCode.trim().toUpperCase() },
    });
    if (!country) {
      throw Errors.notFound('Country not found');
    }
    return country;
  }
}

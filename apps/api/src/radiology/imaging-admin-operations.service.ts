import { Injectable } from '@nestjs/common';
import { LocationKind, Prisma } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';

type LocationRow = Prisma.LocationGetPayload<object>;

@Injectable()
export class ImagingAdminOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: SecurityEventsService,
  ) {}

  private async countryCodeById(countryId: string): Promise<string> {
    const country = await this.prisma.country.findUnique({
      where: { id: countryId },
      select: { isoAlpha2: true },
    });
    return country?.isoAlpha2 ?? '—';
  }

  private async requireImagingOrg(imagingOrgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: imagingOrgId },
      include: { country: { select: { isoAlpha2: true, id: true } } },
    });
    if (!org || org.kind !== 'IMAGING_CENTER') {
      throw Errors.validation('imaging_org_id must reference an imaging center organization.');
    }
    return org;
  }

  private async presentLocation(row: LocationRow, countryCode?: string) {
    return {
      id: row.id,
      name: row.name,
      city: row.city,
      region: row.region,
      postal_code: row.postalCode,
      address_line: row.addressLine,
      timezone: row.timezone,
      is_active: row.isActive,
      country_code: countryCode ?? (await this.countryCodeById(row.countryId)),
      latitude: row.latitude?.toString() ?? null,
      longitude: row.longitude?.toString() ?? null,
      updated_at: row.updatedAt.toISOString(),
    };
  }

  async listLocations(imagingOrgId: string) {
    await this.requireImagingOrg(imagingOrgId);
    const rows = await this.prisma.runWithTenant(workerTenantContext(), () =>
      this.prisma.location.findMany({
        where: { organizationId: imagingOrgId, kind: LocationKind.IMAGING },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
    );
    const countryCodes = new Map<string, string>();
    for (const id of [...new Set(rows.map((row) => row.countryId))]) {
      countryCodes.set(id, await this.countryCodeById(id));
    }
    return {
      data: await Promise.all(
        rows.map((row) => this.presentLocation(row, countryCodes.get(row.countryId))),
      ),
    };
  }

  async updateLocation(principal: Principal, locationId: string, patch: { is_active?: boolean; name?: string; timezone?: string }) {
    const existing = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!existing || existing.kind !== LocationKind.IMAGING) {
      throw Errors.notFound('Imaging location not found.');
    }
    const updated = await this.prisma.location.update({
      where: { id: locationId },
      data: {
        isActive: patch.is_active ?? existing.isActive,
        name: patch.name?.trim() || existing.name,
        timezone: patch.timezone?.trim() || existing.timezone,
      },
    });
    await this.events.emit({
      type: 'IMAGING_LOCATION_UPDATED',
      personId: principal.personId,
      outcome: 'success',
      metadata: {
        location_id: locationId,
        imaging_org_id: existing.organizationId,
        is_active: updated.isActive,
      },
    });
    return { location: await this.presentLocation(updated) };
  }

  async listStudies(imagingOrgId: string) {
    await this.requireImagingOrg(imagingOrgId);
    const rows = await this.prisma.runWithTenant(workerTenantContext(), () =>
      this.prisma.imagingStudy.findMany({
        where: { imagingOrgId },
        include: {
          imagingLocation: { select: { id: true, name: true, city: true } },
          acquisition: true,
          booking: { select: { id: true, status: true, slotStartsAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
    return {
      data: rows.map((row) => ({
        id: row.id,
        accession_number: row.accessionNumber,
        status: row.status,
        modality_code: row.modalityCode,
        body_region_code: row.bodyRegionCode,
        location: row.imagingLocation,
        booking_status: row.booking.status,
        scheduled_at: row.booking.slotStartsAt?.toISOString() ?? null,
        equipment_code: row.acquisition?.equipmentCode ?? null,
        acquisition_status: row.acquisition?.status ?? null,
        sandbox: row.sandbox,
        updated_at: row.updatedAt.toISOString(),
      })),
    };
  }

  async listEquipment(imagingOrgId: string) {
    await this.requireImagingOrg(imagingOrgId);
    const acquisitions = await this.prisma.runWithTenant(workerTenantContext(), () =>
      this.prisma.imagingAcquisition.findMany({
        where: { study: { imagingOrgId } },
        include: { study: { select: { modalityCode: true, imagingLocationId: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
    );
    const byCode = new Map<
      string,
      {
        equipment_code: string;
        modality_code: string | null;
        last_status: string;
        last_seen_at: string;
        location_ids: Set<string>;
      }
    >();
    for (const row of acquisitions) {
      const code = row.equipmentCode?.trim() || 'UNASSIGNED';
      const current = byCode.get(code) ?? {
        equipment_code: code,
        modality_code: row.study.modalityCode,
        last_status: row.status,
        last_seen_at: row.updatedAt.toISOString(),
        location_ids: new Set<string>(),
      };
      current.location_ids.add(row.study.imagingLocationId);
      if (row.updatedAt.toISOString() > current.last_seen_at) {
        current.last_status = row.status;
        current.last_seen_at = row.updatedAt.toISOString();
      }
      byCode.set(code, current);
    }
    return {
      note: 'Equipment derived from acquisition metadata. External PACS/DICOM integrations remain sandbox/unconfigured.',
      data: [...byCode.values()].map((row) => ({
        equipment_code: row.equipment_code,
        modality_code: row.modality_code,
        last_status: row.last_status,
        last_seen_at: row.last_seen_at,
        location_count: row.location_ids.size,
        integration: row.equipment_code === 'UNASSIGNED' ? 'unconfigured' : 'sandbox_metadata',
      })),
    };
  }

  async bookingSummary(imagingOrgId: string) {
    await this.requireImagingOrg(imagingOrgId);
    const [total, confirmed, cancelled, studies, locations] = await this.prisma.runWithTenant(workerTenantContext(), () =>
      Promise.all([
        this.prisma.imagingBooking.count({ where: { imagingOrgId } }),
        this.prisma.imagingBooking.count({ where: { imagingOrgId, status: 'CONFIRMED' } }),
        this.prisma.imagingBooking.count({ where: { imagingOrgId, status: 'CANCELLED' } }),
        this.prisma.imagingStudy.count({ where: { imagingOrgId, status: { in: ['SCHEDULED', 'CHECKED_IN', 'ACQUISITION_IN_PROGRESS'] } } }),
        this.prisma.location.count({ where: { organizationId: imagingOrgId, kind: LocationKind.IMAGING, isActive: true } }),
      ]),
    );
    return {
      imaging_org_id: imagingOrgId,
      bookings_total: total,
      bookings_confirmed: confirmed,
      bookings_cancelled: cancelled,
      active_studies: studies,
      active_locations: locations,
      scheduling_capacity_note: 'Capacity is derived from active locations and in-flight studies; no external scheduler connected.',
      sandbox: true,
    };
  }
}

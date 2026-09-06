import { Inject, Injectable, forwardRef } from '@nestjs/common';
import {
  LogisticsJobStatus,
  LogisticsJobType,
  OrganizationKind,
  ProofOfDeliveryKind,
  ShipmentStatus,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { SecurityEventsService } from '../identity/security-events.service';
import type { Principal } from '../identity/current-principal';
import { rejectClientTenantSpoof } from '../identity/object-authorization';
import { LabDiagnosticsOpsService } from '../lab/lab-diagnostics-ops.service';
import { PhysicalReportService } from '../lab/physical-report.service';
import { ImagingPhysicalReportService } from '../radiology/imaging-physical-report.service';
import { LogisticsService } from '../logistics/logistics.service';
import { haversineKm, pickNearestOnlineRider } from '../logistics/geo';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { DeliveryEvidenceService, type PodLocationInput } from './delivery-evidence.service';

function coerceCoord(value: unknown, min: number, max: number): number | null {
  if (value == null || value === '') {
    return null;
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    return null;
  }
  return Math.round(n * 1e6) / 1e6;
}

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => LogisticsService))
    private readonly logistics: LogisticsService,
    private readonly events: SecurityEventsService,
    private readonly evidence: DeliveryEvidenceService,
    @Inject(forwardRef(() => LabDiagnosticsOpsService))
    private readonly labOps: LabDiagnosticsOpsService,
    @Inject(forwardRef(() => PhysicalReportService))
    private readonly physicalReports: PhysicalReportService,
    @Inject(forwardRef(() => ImagingPhysicalReportService))
    private readonly imagingPhysicalReports: ImagingPhysicalReportService,
  ) {}

  async setPresence(
    principal: Principal,
    online: boolean,
    organizationId?: string,
    coords?: { latitude?: number | null; longitude?: number | null },
  ) {
    await this.assertRider(principal, organizationId);
    const latitude = coerceCoord(coords?.latitude, -90, 90);
    const longitude = coerceCoord(coords?.longitude, -180, 180);
    if ((coords?.latitude != null || coords?.longitude != null) && (latitude == null || longitude == null)) {
      throw Errors.validation('latitude and longitude must be valid WGS-84 coordinates when provided.');
    }
    const geoPatch =
      latitude != null && longitude != null ? { latitude, longitude } : {};
    const row = await this.prisma.riderPresence.upsert({
      where: { personId: principal.personId },
      update: {
        online,
        organizationId: organizationId ?? undefined,
        updatedAt: new Date(),
        ...geoPatch,
      },
      create: {
        id: uuidv7(),
        personId: principal.personId,
        organizationId: organizationId ?? null,
        online,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
      },
    });
    await this.events.emit({
      type: 'LOGIN_SUCCESS',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        rider_presence: online,
        organization_id: organizationId ?? null,
        has_geo: row.latitude != null && row.longitude != null,
      },
    });
    return {
      online: row.online,
      updated_at: row.updatedAt,
      latitude: row.latitude != null ? Number(row.latitude) : null,
      longitude: row.longitude != null ? Number(row.longitude) : null,
    };
  }

  async listJobsAdmin() {
    const rows = await this.prisma.logisticsJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        shipment: {
          include: {
            order: { include: { address: true } },
            location: true,
            returnShipment: true,
          },
        },
        labSample: { include: { booking: { include: { lines: true } } } },
        physicalReportRequest: true,
        imagingPhysicalReportRequest: true,
      },
    });
    return { data: rows.map((row) => this.presentJob(row)) };
  }

  async listJobs(principal: Principal) {
    await this.assertRider(principal);
    const rows = await this.prisma.logisticsJob.findMany({
      where: {
        OR: [
          {
            jobType: LogisticsJobType.MEDICINE_DELIVERY,
            OR: [{ assigneeId: principal.personId }, { assigneeId: null, status: LogisticsJobStatus.CREATED }],
          },
          {
            jobType: LogisticsJobType.SAMPLE_TRANSPORT,
            OR: [{ assigneeId: principal.personId }, { assigneeId: null, status: LogisticsJobStatus.CREATED }],
          },
          {
            jobType: LogisticsJobType.REPORT_DELIVERY,
            OR: [{ assigneeId: principal.personId }, { assigneeId: null, status: LogisticsJobStatus.CREATED }],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        shipment: {
          include: {
            order: { include: { address: true } },
            location: true,
            returnShipment: true,
          },
        },
        labSample: { include: { booking: { include: { lines: true } } } },
        physicalReportRequest: true,
        imagingPhysicalReportRequest: true,
      },
    });
    return {
      data: rows
        .filter((row) => row.assigneeId === principal.personId || row.assigneeId === null)
        .map((row) => this.presentJob(row)),
    };
  }

  async getJob(principal: Principal, jobId: string) {
    await this.assertRider(principal);
    const row = await this.loadJob(jobId);
    this.assertAssignee(principal, row);
    return this.presentJob(row);
  }

  async acceptJob(principal: Principal, jobId: string) {
    await this.assertRider(principal);
    const row = await this.loadJob(jobId);
    if (row.assigneeId && row.assigneeId !== principal.personId) {
      throw Errors.forbidden('This job is assigned to another rider.');
    }
    if (row.status !== LogisticsJobStatus.CREATED && row.status !== LogisticsJobStatus.ASSIGNED) {
      throw Errors.problem(409, 'ILLEGAL_JOB_TRANSITION', 'Illegal transition', row.status);
    }
    const claimed = await this.prisma.logisticsJob.updateMany({
      where: {
        id: jobId,
        status: { in: [LogisticsJobStatus.CREATED, LogisticsJobStatus.ASSIGNED] },
        OR: [{ assigneeId: null }, { assigneeId: principal.personId }],
      },
      data: { assigneeId: principal.personId, status: LogisticsJobStatus.ASSIGNED },
    });
    if (claimed.count === 0) {
      const current = await this.loadJob(jobId);
      if (current.assigneeId && current.assigneeId !== principal.personId) {
        throw Errors.forbidden('This job is assigned to another rider.');
      }
      throw Errors.problem(409, 'ILLEGAL_JOB_TRANSITION', 'Illegal transition', current.status);
    }
    const updated = await this.loadJob(jobId);
    if (updated.jobType !== LogisticsJobType.SAMPLE_TRANSPORT && updated.jobType !== LogisticsJobType.REPORT_DELIVERY) {
      await this.recordEvent(jobId, 'JOB_ACCEPTED', { rider_id: principal.personId });
    }
    return this.presentJob(updated);
  }

  async arrive(principal: Principal, jobId: string, location?: PodLocationInput) {
    const row = await this.assertAssigned(principal, jobId);
    if (
      row.status === LogisticsJobStatus.IN_PROGRESS ||
      row.status === LogisticsJobStatus.PICKUP ||
      row.status === LogisticsJobStatus.DELIVERED
    ) {
      return this.presentJob(await this.loadJob(jobId));
    }
    const updated = await this.prisma.logisticsJob.update({
      where: { id: jobId },
      data: { status: LogisticsJobStatus.IN_PROGRESS },
      include: { shipment: { include: { order: { include: { address: true } } } } },
    });
    await this.recordEvent(jobId, 'RIDER_ARRIVED', {
      shipment_id: row.shipmentId,
      ...locationPayload(location),
    });
    return this.presentJob(updated);
  }

  async pickup(principal: Principal, jobId: string, location?: PodLocationInput) {
    const row = await this.assertAssigned(principal, jobId);
    if (row.jobType === LogisticsJobType.SAMPLE_TRANSPORT) {
      return this.labOps.transportPickup(principal.personId, jobId);
    }
    if (row.jobType === LogisticsJobType.REPORT_DELIVERY) {
      if (row.imagingPhysicalReportRequestId) {
        const updated = await this.prisma.logisticsJob.update({
          where: { id: jobId },
          data: { status: LogisticsJobStatus.PICKUP },
          include: { imagingPhysicalReportRequest: true },
        });
        return this.imagingPhysicalReports.presentReportDeliveryJob(updated);
      }
      const updated = await this.prisma.logisticsJob.update({
        where: { id: jobId },
        data: { status: LogisticsJobStatus.PICKUP },
        include: { physicalReportRequest: true },
      });
      return this.physicalReports.presentReportDeliveryJob(updated);
    }
    if (row.status === LogisticsJobStatus.PICKUP || row.status === LogisticsJobStatus.DELIVERED) {
      return this.presentJob(await this.loadJob(jobId));
    }
    if (row.shipmentId) {
      // Switch to worker GUCs for shipment advance; nestMutex is re-entrant (S462).
      await this.prisma.runWithTenant(workerTenantContext(), () =>
        this.logistics.advanceShipmentForRiderPickup(row.shipmentId!),
      );
    }
    const updated = await this.prisma.logisticsJob.update({
      where: { id: jobId },
      data: { status: LogisticsJobStatus.PICKUP },
      include: { shipment: { include: { order: { include: { address: true } } } } },
    });
    await this.recordEvent(jobId, 'RIDER_PICKUP', {
      shipment_id: row.shipmentId,
      ...locationPayload(location),
    });
    return this.presentJob(updated);
  }

  async deliverSample(principal: Principal, jobId: string) {
    const row = await this.loadJob(jobId);
    if (row.jobType === LogisticsJobType.SAMPLE_TRANSPORT) {
      return this.labOps.transportDeliver(principal.personId, jobId);
    }
    if (row.jobType === LogisticsJobType.REPORT_DELIVERY) {
      if (row.imagingPhysicalReportRequestId) {
        return this.imagingPhysicalReports.markDeliveredFromJob(principal.personId, jobId);
      }
      return this.physicalReports.markDeliveredFromJob(principal.personId, jobId);
    }
    throw Errors.validation('Use POD verification for medicine delivery jobs.');
  }

  async attachPodPhoto(
    principal: Principal,
    jobId: string,
    input: {
      contentBase64: string;
      contentType: string;
      idempotencyKey?: string;
      location?: PodLocationInput;
    },
  ) {
    const row = await this.assertAssigned(principal, jobId);
    return this.evidence.attachPhotoEvidence(principal, row, input);
  }

  async attachPodSignature(
    principal: Principal,
    jobId: string,
    input: {
      contentBase64: string;
      contentType: string;
      idempotencyKey?: string;
      location?: PodLocationInput;
    },
  ) {
    const row = await this.assertAssigned(principal, jobId);
    return this.evidence.attachSignatureEvidence(principal, row, input);
  }

  async getPodEvidenceTicket(principal: Principal, jobId: string, kind: 'PHOTO' | 'SIGNATURE') {
    const row = await this.assertAssigned(principal, jobId);
    const mapped = kind === 'PHOTO' ? ProofOfDeliveryKind.PHOTO : ProofOfDeliveryKind.SIGNATURE;
    return this.evidence.issueEvidenceTicket(principal, row, mapped);
  }

  async verifyPod(principal: Principal, jobId: string, code: string, photoUri?: string, location?: PodLocationInput) {
    const row = await this.assertAssigned(principal, jobId);
    if (!row.shipmentId) {
      throw Errors.notFound('Shipment not linked to job.');
    }
    if (row.status === LogisticsJobStatus.DELIVERED) {
      return this.presentJob(await this.loadJob(jobId));
    }
    if (
      row.shipment &&
      (
        [
          ShipmentStatus.DELIVERY_FAILED,
          ShipmentStatus.RETURN_TO_ORIGIN,
          ShipmentStatus.RETURNED,
          ShipmentStatus.CANCELLED,
        ] as ShipmentStatus[]
      ).includes(row.shipment.status)
    ) {
      throw Errors.problem(
        409,
        'ILLEGAL_SHIPMENT_TRANSITION',
        'Illegal transition',
        `Cannot verify POD while shipment is ${row.shipment.status}.`,
      );
    }
    await this.prisma.runWithTenant(workerTenantContext(), () =>
      this.logistics.verifyOtp(row.shipmentId!, code),
    );
    const existingPayload =
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};
    const captured = photoUri?.trim();
    const updated = await this.prisma.logisticsJob.update({
      where: { id: jobId },
      data: captured
        ? {
            status: LogisticsJobStatus.DELIVERED,
            payload: {
              ...existingPayload,
              pod_photo_uri: captured,
              pod_photo_captured_at: new Date().toISOString(),
            },
          }
        : { status: LogisticsJobStatus.DELIVERED },
      include: { shipment: { include: { order: { include: { address: true } } } } },
    });
    await this.events.emit({
      type: 'LOGIN_SUCCESS',
      outcome: 'success',
      personId: principal.personId,
      metadata: { pod_verified: true, job_id: jobId, shipment_id: row.shipmentId, pod_photo: Boolean(photoUri?.trim()) },
    });
    await this.recordEvent(jobId, 'POD_VERIFIED', {
      shipment_id: row.shipmentId,
      pod_photo: Boolean(photoUri?.trim() || existingPayload['pod_photo_object_key']),
      ...locationPayload(location),
    });
    return this.presentJob(updated);
  }

  async failDelivery(principal: Principal, jobId: string, reason: string) {
    const row = await this.assertAssigned(principal, jobId);
    if (row.jobType === LogisticsJobType.REPORT_DELIVERY) {
      if (row.imagingPhysicalReportRequestId) {
        return this.imagingPhysicalReports.markDeliveryFailedFromJob(principal.personId, jobId, reason);
      }
      return this.physicalReports.markDeliveryFailedFromJob(principal.personId, jobId, reason);
    }
    if (row.status === LogisticsJobStatus.FAILED || row.status === LogisticsJobStatus.RETURNED) {
      return this.presentJob(await this.loadJob(jobId));
    }
    if (row.shipmentId && row.jobType === LogisticsJobType.MEDICINE_DELIVERY) {
      await this.prisma.runWithTenant(workerTenantContext(), () =>
        this.logistics.advanceShipmentForDeliveryFailure(row.shipmentId!, reason),
      );
    }
    const updated = await this.prisma.logisticsJob.update({
      where: { id: jobId },
      data: { status: LogisticsJobStatus.FAILED },
      include: { shipment: { include: { order: { include: { address: true } } } } },
    });
    await this.recordEvent(jobId, 'DELIVERY_FAILED', { reason, shipment_id: row.shipmentId });
    return this.presentJob(updated);
  }

  async startRto(principal: Principal, jobId: string) {
    const row = await this.assertAssigned(principal, jobId);
    if (!row.shipmentId) {
      throw Errors.notFound('Shipment not linked to job.');
    }
    if (row.status === LogisticsJobStatus.RETURNED) {
      return this.presentJob(await this.loadJob(jobId));
    }
    await this.prisma.runWithTenant(workerTenantContext(), () => this.logistics.markRto(row.shipmentId!));
    const updated = await this.prisma.logisticsJob.update({
      where: { id: jobId },
      data: { status: LogisticsJobStatus.RETURNED },
      include: { shipment: { include: { order: { include: { address: true } } } } },
    });
    await this.recordEvent(jobId, 'RTO_STARTED', { shipment_id: row.shipmentId });
    return this.presentJob(updated);
  }

  async ensureJobForShipment(shipmentId: string) {
    let existing = await this.prisma.logisticsJob.findFirst({
      where: { shipmentId, jobType: LogisticsJobType.MEDICINE_DELIVERY },
    });
    if (!existing) {
      const shipment = await this.prisma.shipment.findUniqueOrThrow({
        where: { id: shipmentId },
        include: { location: true, order: { include: { address: true } } },
      });
      existing = await this.prisma.logisticsJob.create({
        data: {
          id: uuidv7(),
          shipmentId: shipment.id,
          jobType: LogisticsJobType.MEDICINE_DELIVERY,
          status: LogisticsJobStatus.CREATED,
          payload: {
            seller_org_id: shipment.sellerOrgId,
            location_id: shipment.locationId,
            sandbox: true,
            routing: {
              mode: 'nearest_online_rider',
              pickup_postal: shipment.location?.postalCode ?? null,
              pickup_city: shipment.location?.city ?? null,
              drop_postal: shipment.order?.address?.postalCode ?? null,
              drop_city: shipment.order?.address?.city ?? null,
            },
          },
        },
      });
    }

    // POD OTP ready as soon as the job exists (before rider claim).
    await this.logistics.ensureOtp(shipmentId);

    if (!existing.assigneeId && existing.status === LogisticsJobStatus.CREATED) {
      existing = await this.autoAssignNearestOnlineRider(existing.id, shipmentId);
    }
    return existing;
  }

  /**
   * After pack+book: auto-assign nearest online DELIVERY_PARTNER by GPS (fallback: org / freshest).
   */
  private async autoAssignNearestOnlineRider(jobId: string, shipmentId: string) {
    const job = await this.prisma.logisticsJob.findUniqueOrThrow({
      where: { id: jobId },
      include: {
        shipment: { include: { location: true } },
      },
    });
    if (job.assigneeId || job.status !== LogisticsJobStatus.CREATED) {
      return job;
    }

    const online = await this.prisma.riderPresence.findMany({
      where: { online: true },
      take: 50,
      orderBy: { updatedAt: 'desc' },
    });
    if (!online.length) {
      await this.recordEvent(jobId, 'JOB_WAITING_RIDER', {
        shipment_id: shipmentId,
        reason: 'no_online_riders',
      });
      return job;
    }

    const partners = await this.prisma.partner.findMany({
      where: {
        personId: { in: online.map((r) => r.personId) },
        partnerTypeCode: 'DELIVERY_PARTNER',
        status: 'ACTIVE',
      },
      select: { personId: true },
    });
    const eligible = new Set(partners.map((p) => p.personId));
    const candidates = online
      .filter((r) => eligible.has(r.personId))
      .map((r) => ({
        personId: r.personId,
        organizationId: r.organizationId,
        updatedAt: r.updatedAt,
        latitude: r.latitude != null ? Number(r.latitude) : null,
        longitude: r.longitude != null ? Number(r.longitude) : null,
      }));
    const loc = job.shipment?.location;
    const preferred = pickNearestOnlineRider(
      candidates,
      loc
        ? {
            latitude: loc.latitude != null ? Number(loc.latitude) : null,
            longitude: loc.longitude != null ? Number(loc.longitude) : null,
            postalCode: loc.postalCode,
            city: loc.city,
          }
        : null,
      { preferredOrganizationId: job.shipment?.sellerOrgId ?? null },
    );
    if (!preferred?.personId) {
      await this.recordEvent(jobId, 'JOB_WAITING_RIDER', {
        shipment_id: shipmentId,
        reason: 'no_eligible_online_riders',
      });
      return job;
    }

    const updated = await this.prisma.logisticsJob.update({
      where: { id: jobId },
      data: { assigneeId: preferred.personId, status: LogisticsJobStatus.ASSIGNED },
    });
    const distanceKm =
      preferred.latitude != null &&
      preferred.longitude != null &&
      loc?.latitude != null &&
      loc?.longitude != null
        ? Math.round(
            haversineKm(
              Number(loc.latitude),
              Number(loc.longitude),
              preferred.latitude,
              preferred.longitude,
            ) * 10,
          ) / 10
        : null;
    await this.recordEvent(jobId, 'JOB_AUTO_ASSIGNED', {
      shipment_id: shipmentId,
      assignee_id: preferred.personId,
      mode: 'nearest_online_rider',
      distance_km: distanceKm,
      pickup_postal: loc?.postalCode ?? null,
      pickup_city: loc?.city ?? null,
      rider_has_geo: preferred.latitude != null && preferred.longitude != null,
    });
    return updated;
  }

  async assignJob(shipmentId: string, assigneeId: string, actorId: string) {
    const job = await this.ensureJobForShipment(shipmentId);
    const previousAssignee = job.assigneeId;
    const updated = await this.prisma.logisticsJob.update({
      where: { id: job.id },
      data: { assigneeId, status: LogisticsJobStatus.ASSIGNED },
    });
    await this.logistics.ensureOtp(shipmentId);
    if (previousAssignee && previousAssignee !== assigneeId) {
      await this.recordEvent(job.id, 'JOB_REASSIGNED', {
        from_assignee_id: previousAssignee,
        to_assignee_id: assigneeId,
        actor_id: actorId,
        shipment_id: shipmentId,
      });
    }
    await this.events.emit({
      type: 'LOGIN_SUCCESS',
      outcome: 'success',
      personId: actorId,
      metadata: { job_assigned: job.id, assignee_id: assigneeId, shipment_id: shipmentId },
    });
    return updated;
  }

  async syncJobWithShipmentStatus(shipmentId: string, shipmentStatus: ShipmentStatus): Promise<void> {
    const job = await this.prisma.logisticsJob.findFirst({
      where: { shipmentId, jobType: LogisticsJobType.MEDICINE_DELIVERY },
    });
    if (!job) {
      return;
    }
    let jobStatus: LogisticsJobStatus | null = null;
    switch (shipmentStatus) {
      case ShipmentStatus.DELIVERED:
        jobStatus = LogisticsJobStatus.DELIVERED;
        break;
      case ShipmentStatus.DELIVERY_FAILED:
        jobStatus = LogisticsJobStatus.FAILED;
        break;
      case ShipmentStatus.RETURN_TO_ORIGIN:
      case ShipmentStatus.RETURNED:
        jobStatus = LogisticsJobStatus.RETURNED;
        break;
      default:
        return;
    }
    if (job.status === jobStatus) {
      return;
    }
    if (job.status === LogisticsJobStatus.DELIVERED && jobStatus !== LogisticsJobStatus.DELIVERED) {
      return;
    }
    await this.prisma.logisticsJob.update({ where: { id: job.id }, data: { status: jobStatus } });
  }

  private async loadJob(jobId: string) {
    const row = await this.prisma.logisticsJob.findUnique({
      where: { id: jobId },
      include: {
        shipment: {
          include: {
            order: { include: { address: true } },
            location: true,
            returnShipment: true,
          },
        },
        labSample: { include: { booking: { include: { lines: true } } } },
        physicalReportRequest: true,
        imagingPhysicalReportRequest: true,
      },
    });
    if (!row) {
      throw Errors.notFound('Delivery job not found.');
    }
    return row;
  }

  private async assertAssigned(principal: Principal, jobId: string) {
    await this.assertRider(principal);
    const row = await this.loadJob(jobId);
    this.assertAssignee(principal, row);
    return row;
  }

  private assertAssignee(
    principal: Principal,
    row: { assigneeId: string | null; status: LogisticsJobStatus },
  ) {
    if (row.assigneeId && row.assigneeId !== principal.personId) {
      throw Errors.forbidden('You cannot access another rider’s job.');
    }
    if (!row.assigneeId) {
      throw Errors.forbidden('Accept the job before updating delivery status.');
    }
  }

  async assertRiderAccess(principal: Principal, organizationId?: string) {
    await this.assertRider(principal, organizationId);
  }

  private async assertRider(principal: Principal, organizationId?: string) {
    const partner = await this.prisma.partner.findFirst({
      where: { personId: principal.personId, partnerTypeCode: 'DELIVERY_PARTNER' },
    });
    // Fleet staff only — never treat arbitrary vendor/lab/clinic membership as rider access.
    const fleetMemberships = await this.prisma.membership.findMany({
      where: {
        personId: principal.personId,
        status: 'ACTIVE',
        deletedAt: null,
        organization: { kind: OrganizationKind.LOGISTICS_FLEET },
      },
      select: { organizationId: true },
    });
    const fleetOrgIds = fleetMemberships
      .map((m) => m.organizationId)
      .filter((id): id is string => Boolean(id));
    if (!partner && fleetOrgIds.length === 0) {
      throw Errors.forbidden('Delivery access requires a delivery partner profile or fleet membership.');
    }
    // Client-supplied organization_id is never authority alone.
    rejectClientTenantSpoof(organizationId, fleetOrgIds);
  }

  private async recordEvent(jobId: string, type: string, payload: Record<string, unknown>) {
    const job = await this.prisma.logisticsJob.findUnique({
      where: { id: jobId },
      include: { shipment: { select: { countryId: true } } },
    });
    await this.prisma.runWithTenant(workerTenantContext({ countryId: job?.shipment?.countryId }), () =>
      this.prisma.logisticsJobEvent.create({
        data: { id: uuidv7(), jobId, type, payload: payload as object },
      }),
    );
  }

  private presentJob(row: {
    id: string;
    shipmentId: string | null;
    jobType: LogisticsJobType;
    status: LogisticsJobStatus;
    assigneeId: string | null;
    payload: unknown;
    createdAt: Date;
    labSampleId?: string | null;
    shipment?: {
      id: string;
      status: ShipmentStatus;
      trackingNumber: string | null;
      location?: {
        name?: string | null;
        city: string | null;
        postalCode: string | null;
        addressLine?: string | null;
        region?: string | null;
      } | null;
      returnShipment?: { trackingNumber: string | null } | null;
      order?: {
        address?: {
          city: string | null;
          region: string | null;
          recipientName: string | null;
          line1?: string | null;
          postalCode?: string | null;
        } | null;
      } | null;
    } | null;
    labSample?: {
      containerBarcode: string | null;
      status: string;
      booking?: { lines: Array<{ title: string }> };
    } | null;
    physicalReportRequest?: {
      sealedPackageId: string | null;
      deliveryAddressSnapshot: unknown;
      status: string;
    } | null;
    imagingPhysicalReportRequestId?: string | null;
    imagingPhysicalReportRequest?: {
      sealedPackageId: string | null;
      deliveryAddressSnapshot: unknown;
      status: string;
    } | null;
  }) {
    if (row.jobType === LogisticsJobType.SAMPLE_TRANSPORT) {
      return {
        id: row.id,
        shipment_id: null,
        job_type: row.jobType,
        status: row.status,
        assignee_id: row.assigneeId,
        tracking_number: row.labSample?.containerBarcode ?? null,
        shipment_status: row.labSample?.status ?? null,
        test_title: row.labSample?.booking?.lines[0]?.title ?? 'Lab sample',
      dropoff: { city: 'Lab', region: null, recipient: null, query: 'World Pharma Lab receiving dock' },
        pickup: { label: 'Collection origin', query: 'Patient collection / sample pickup' },
        sandbox: true,
        created_at: row.createdAt,
        note: 'Sealed sample transport. No clinical data.',
      };
    }
    if (row.jobType === LogisticsJobType.REPORT_DELIVERY) {
      if (row.imagingPhysicalReportRequestId || row.imagingPhysicalReportRequest) {
        return this.imagingPhysicalReports.presentReportDeliveryJob(row);
      }
      return this.physicalReports.presentReportDeliveryJob(row);
    }
    const address = row.shipment?.order?.address;
    const location = row.shipment?.location;
    const payload =
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};
    const isReturnPickup = payload.direction === 'RETURN_PICKUP';
    const customerLine1 = address?.line1 ?? null;
    const customerQuery =
      [customerLine1, address?.city, address?.region, address?.postalCode].filter(Boolean).join(', ') ||
      'Customer address';
    const pharmacyQuery =
      [location?.name ?? location?.addressLine, location?.city, location?.postalCode].filter(Boolean).join(', ') ||
      'World Pharma partner pharmacy';
    const customerStop = {
      city: address?.city ?? null,
      region: address?.region ?? null,
      recipient: address?.recipientName ? maskName(address.recipientName) : null,
      line1: customerLine1,
      query: customerQuery,
    };
    const pharmacyStop = {
      city: location?.city ?? null,
      region: location?.region ?? null,
      recipient: location?.name ?? 'Pharmacy',
      line1: location?.addressLine ?? null,
      query: pharmacyQuery,
    };
    return {
      id: row.id,
      shipment_id: row.shipmentId,
      job_type: row.jobType,
      status: row.status,
      assignee_id: row.assigneeId,
      direction: isReturnPickup ? ('RETURN_PICKUP' as const) : ('OUTBOUND' as const),
      return_request_id: typeof payload.return_request_id === 'string' ? payload.return_request_id : null,
      pickup_slot_start: typeof payload.pickup_slot_start === 'string' ? payload.pickup_slot_start : null,
      pickup_slot_end: typeof payload.pickup_slot_end === 'string' ? payload.pickup_slot_end : null,
      parcel_label: isReturnPickup ? 'Return pickup' : null,
      tracking_number: isReturnPickup
        ? (row.shipment?.returnShipment?.trackingNumber ?? row.shipment?.trackingNumber ?? null)
        : (row.shipment?.trackingNumber ?? null),
      shipment_status: row.shipment?.status ?? null,
      // Return: collect from customer → return to pharmacy. Outbound: pharmacy → customer.
      dropoff: isReturnPickup ? pharmacyStop : customerStop,
      pickup: isReturnPickup
        ? { ...customerStop, label: 'Collect from customer', query: customerQuery }
        : { label: 'Pharmacy pickup', query: pharmacyQuery },
      sandbox: true,
      created_at: row.createdAt,
      note: isReturnPickup
        ? 'Return pickup — collect parcel from customer, hand off at pharmacy.'
        : undefined,
      pod_photo_captured: Boolean(payload['pod_photo_uri'] || payload['pod_photo_object_key']),
      pod_evidence: {
        photo: Boolean(payload['pod_photo_object_key'] || payload['pod_photo_uri']),
        signature: Boolean(payload['pod_signature_object_key']),
        sandbox: true,
      },
    };
  }
}

function locationPayload(location?: PodLocationInput): Record<string, unknown> {
  if (!location?.latitude && !location?.longitude) {
    return {};
  }
  return {
    location: {
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
      accuracy_meters: location.accuracy_meters ?? null,
      source: 'client_injected',
      device_gps_validated: false,
    },
  };
}

function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) {
    return `${parts[0]?.slice(0, 1) ?? ''}***`;
  }
  return `${parts[0]} ${parts[parts.length - 1]?.slice(0, 1) ?? ''}.`;
}

import { Inject, Injectable, forwardRef } from '@nestjs/common';
import {
  LogisticsJobStatus,
  LogisticsJobType,
  ShipmentStatus,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { SecurityEventsService } from '../identity/security-events.service';
import type { Principal } from '../identity/current-principal';
import { LabDiagnosticsOpsService } from '../lab/lab-diagnostics-ops.service';
import { PhysicalReportService } from '../lab/physical-report.service';
import { ImagingPhysicalReportService } from '../radiology/imaging-physical-report.service';
import { LogisticsService } from '../logistics/logistics.service';

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logistics: LogisticsService,
    private readonly events: SecurityEventsService,
    @Inject(forwardRef(() => LabDiagnosticsOpsService))
    private readonly labOps: LabDiagnosticsOpsService,
    @Inject(forwardRef(() => PhysicalReportService))
    private readonly physicalReports: PhysicalReportService,
    @Inject(forwardRef(() => ImagingPhysicalReportService))
    private readonly imagingPhysicalReports: ImagingPhysicalReportService,
  ) {}

  async setPresence(principal: Principal, online: boolean, organizationId?: string) {
    await this.assertRider(principal, organizationId);
    const row = await this.prisma.riderPresence.upsert({
      where: { personId: principal.personId },
      update: { online, organizationId: organizationId ?? undefined, updatedAt: new Date() },
      create: {
        id: uuidv7(),
        personId: principal.personId,
        organizationId: organizationId ?? null,
        online,
      },
    });
    await this.events.emit({
      type: 'LOGIN_SUCCESS',
      outcome: 'success',
      personId: principal.personId,
      metadata: { rider_presence: online, organization_id: organizationId ?? null },
    });
    return { online: row.online, updated_at: row.updatedAt };
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
    const row = await this.loadJob(jobId);
    this.assertAssignee(principal, row);
    return this.presentJob(row);
  }

  async acceptJob(principal: Principal, jobId: string) {
    const row = await this.loadJob(jobId);
    if (row.assigneeId && row.assigneeId !== principal.personId) {
      throw Errors.forbidden('This job is assigned to another rider.');
    }
    if (row.status !== LogisticsJobStatus.CREATED && row.status !== LogisticsJobStatus.ASSIGNED) {
      throw Errors.problem(409, 'ILLEGAL_JOB_TRANSITION', 'Illegal transition', row.status);
    }
    const updated = await this.prisma.logisticsJob.update({
      where: { id: jobId },
      data: { assigneeId: principal.personId, status: LogisticsJobStatus.ASSIGNED },
      include: {
        shipment: { include: { order: { include: { address: true } } } },
        physicalReportRequest: true,
        imagingPhysicalReportRequest: true,
        labSample: { include: { booking: { include: { lines: true } } } },
      },
    });
    if (row.jobType !== LogisticsJobType.SAMPLE_TRANSPORT && row.jobType !== LogisticsJobType.REPORT_DELIVERY) {
      await this.recordEvent(jobId, 'JOB_ACCEPTED', { rider_id: principal.personId });
    }
    return this.presentJob(updated);
  }

  async arrive(principal: Principal, jobId: string) {
    const row = await this.assertAssigned(principal, jobId);
    const updated = await this.prisma.logisticsJob.update({
      where: { id: jobId },
      data: { status: LogisticsJobStatus.IN_PROGRESS },
      include: { shipment: { include: { order: { include: { address: true } } } } },
    });
    await this.recordEvent(jobId, 'RIDER_ARRIVED', { shipment_id: row.shipmentId });
    return this.presentJob(updated);
  }

  async pickup(principal: Principal, jobId: string) {
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
    const updated = await this.prisma.logisticsJob.update({
      where: { id: jobId },
      data: { status: LogisticsJobStatus.PICKUP },
      include: { shipment: { include: { order: { include: { address: true } } } } },
    });
    await this.recordEvent(jobId, 'RIDER_PICKUP', { shipment_id: row.shipmentId });
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

  async verifyPod(principal: Principal, jobId: string, code: string) {
    const row = await this.assertAssigned(principal, jobId);
    if (!row.shipmentId) {
      throw Errors.notFound('Shipment not linked to job.');
    }
    await this.logistics.verifyOtp(row.shipmentId, code);
    const updated = await this.prisma.logisticsJob.update({
      where: { id: jobId },
      data: { status: LogisticsJobStatus.DELIVERED },
      include: { shipment: { include: { order: { include: { address: true } } } } },
    });
    await this.events.emit({
      type: 'LOGIN_SUCCESS',
      outcome: 'success',
      personId: principal.personId,
      metadata: { pod_verified: true, job_id: jobId, shipment_id: row.shipmentId },
    });
    await this.recordEvent(jobId, 'POD_VERIFIED', { shipment_id: row.shipmentId });
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
    await this.logistics.markRto(row.shipmentId);
    const updated = await this.prisma.logisticsJob.update({
      where: { id: jobId },
      data: { status: LogisticsJobStatus.RETURNED },
      include: { shipment: { include: { order: { include: { address: true } } } } },
    });
    await this.recordEvent(jobId, 'RTO_STARTED', { shipment_id: row.shipmentId });
    return this.presentJob(updated);
  }

  async ensureJobForShipment(shipmentId: string) {
    const existing = await this.prisma.logisticsJob.findFirst({
      where: { shipmentId, jobType: LogisticsJobType.MEDICINE_DELIVERY },
    });
    if (existing) {
      return existing;
    }
    const shipment = await this.prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    return this.prisma.logisticsJob.create({
      data: {
        id: uuidv7(),
        shipmentId: shipment.id,
        jobType: LogisticsJobType.MEDICINE_DELIVERY,
        status: LogisticsJobStatus.CREATED,
        payload: {
          seller_org_id: shipment.sellerOrgId,
          location_id: shipment.locationId,
          sandbox: true,
        },
      },
    });
  }

  async assignJob(shipmentId: string, assigneeId: string, actorId: string) {
    const job = await this.ensureJobForShipment(shipmentId);
    const updated = await this.prisma.logisticsJob.update({
      where: { id: job.id },
      data: { assigneeId, status: LogisticsJobStatus.ASSIGNED },
    });
    await this.events.emit({
      type: 'LOGIN_SUCCESS',
      outcome: 'success',
      personId: actorId,
      metadata: { job_assigned: job.id, assignee_id: assigneeId, shipment_id: shipmentId },
    });
    return updated;
  }

  private async loadJob(jobId: string) {
    const row = await this.prisma.logisticsJob.findUnique({
      where: { id: jobId },
      include: {
        shipment: { include: { order: { include: { address: true } } } },
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
    const membership = await this.prisma.membership.count({
      where: {
        personId: principal.personId,
        status: 'ACTIVE',
        deletedAt: null,
        ...(organizationId ? { organizationId } : {}),
      },
    });
    if (!partner && !membership) {
      throw Errors.forbidden('Delivery access requires a delivery partner profile or fleet membership.');
    }
  }

  private async recordEvent(jobId: string, type: string, payload: Record<string, unknown>) {
    await this.prisma.logisticsJobEvent.create({
      data: { id: uuidv7(), jobId, type, payload: payload as object },
    });
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
      order?: {
        address?: { city: string | null; region: string | null; recipientName: string | null } | null;
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
        dropoff: { city: 'Lab', region: null, recipient: null },
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
    return {
      id: row.id,
      shipment_id: row.shipmentId,
      job_type: row.jobType,
      status: row.status,
      assignee_id: row.assigneeId,
      tracking_number: row.shipment?.trackingNumber ?? null,
      shipment_status: row.shipment?.status ?? null,
      dropoff: {
        city: address?.city ?? null,
        region: address?.region ?? null,
        recipient: address?.recipientName ? maskName(address.recipientName) : null,
      },
      sandbox: true,
      created_at: row.createdAt,
    };
  }
}

function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) {
    return `${parts[0]?.slice(0, 1) ?? ''}***`;
  }
  return `${parts[0]} ${parts[parts.length - 1]?.slice(0, 1) ?? ''}.`;
}

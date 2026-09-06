import { Injectable } from '@nestjs/common';
import {
  ImagingReportVersionStatus,
  LogisticsJobStatus,
  LogisticsJobType,
  PhysicalReportRequestStatus,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { assertImagingOrgAccess } from '../catalog/access';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { assertSamePerson } from '../identity/object-authorization';
import { SecurityEventsService } from '../identity/security-events.service';
import { FinanceService } from '../finance/finance.service';
import { PolicyResolver } from '../policy/resolver';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import {
  assertPhysicalReportTransition,
  isCancellablePhysicalReportStatus,
} from '../lab/physical-report-status';

const SANDBOX_REPORT_DELIVERY_FEE_MINOR = 500n;

type RequestRow = Prisma.ImagingPhysicalReportRequestGetPayload<{
  include: { logisticsJobs: true; imagingReportVersion: true };
}>;

@Injectable()
export class ImagingPhysicalReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly outbox: OutboxService,
    private readonly security: SecurityEventsService,
    private readonly finance: FinanceService,
  ) {}

  async getCustomerEligibility(bookingId: string, customerPersonId: string) {
    const booking = await this.loadCustomerBooking(bookingId, customerPersonId);
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: booking.countryId } });
    const gate = await this.physicalReportPackGate(country.isoAlpha2);
    const report = await this.prisma.imagingReport.findUnique({
      where: { imagingBookingId: booking.id },
      include: { currentVersion: true },
    });
    const published =
      report?.currentVersion?.status === ImagingReportVersionStatus.PUBLISHED ? report.currentVersion : null;
    const existing = await this.prisma.imagingPhysicalReportRequest.findUnique({
      where: { imagingBookingId: booking.id },
    });
    return {
      eligible: gate.ok && Boolean(published),
      reason: gate.ok ? (published ? null : 'Report not published yet.') : gate.reason,
      physical_report_delivery_enabled: gate.ok,
      report_published: Boolean(published),
      existing_request_id: existing?.id ?? null,
      existing_status: existing?.status ?? null,
    };
  }

  async requestPhysicalReport(
    principal: Principal,
    bookingId: string,
    idempotencyKey: string,
    customerAddressId: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw Errors.validation('Idempotency-Key header is required.');
    }
    if (!customerAddressId?.trim()) {
      throw Errors.validation('customer_address_id is required.');
    }
    const booking = await this.loadCustomerBooking(bookingId, principal.personId);
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: booking.countryId } });
    const gate = await this.physicalReportPackGate(country.isoAlpha2);
    if (!gate.ok) {
      throw Errors.problem(403, 'PHYSICAL_REPORT_UNAVAILABLE', 'Physical report unavailable', gate.reason ?? 'Disabled.');
    }
    const existingByKey = await this.prisma.imagingPhysicalReportRequest.findUnique({
      where: { idempotencyKey },
      include: { logisticsJobs: true, imagingReportVersion: true },
    });
    if (existingByKey) {
      assertSamePerson(
        principal.personId,
        existingByKey.customerPersonId,
        'You cannot reuse another customer’s physical report request.',
      );
      if (existingByKey.imagingBookingId !== booking.id) {
        throw Errors.forbidden('Idempotency key is bound to a different booking.');
      }
      return this.presentCustomerRequest(existingByKey);
    }
    const existing = await this.prisma.imagingPhysicalReportRequest.findUnique({
      where: { imagingBookingId: booking.id },
      include: { logisticsJobs: true, imagingReportVersion: true },
    });
    if (existing) {
      return this.presentCustomerRequest(existing);
    }
    const address = await this.prisma.customerAddress.findUnique({ where: { id: customerAddressId } });
    if (!address || address.customerPersonId !== principal.personId) {
      throw Errors.forbidden('Delivery address not found or not owned by you.');
    }
    if (address.countryId !== booking.countryId) {
      throw Errors.validation('Delivery address must match booking country.');
    }
    const report = await this.prisma.imagingReport.findUnique({
      where: { imagingBookingId: booking.id },
      include: { currentVersion: true },
    });
    if (!report?.currentVersion || report.currentVersion.status !== ImagingReportVersionStatus.PUBLISHED) {
      throw Errors.problem(
        409,
        'REPORT_NOT_PUBLISHED',
        'Report not published',
        'Physical report requires a published imaging report.',
      );
    }
    const addressSnapshot = {
      recipient_name: address.recipientName,
      city: address.city,
      line1: address.line1,
      line2: address.line2,
      region: address.region,
      postal_code: address.postalCode,
    };
    const requestId = uuidv7();
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: booking.countryId,
        organizationId: booking.imagingOrgId,
        personId: principal.personId,
      }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.imagingPhysicalReportRequest.create({
            data: {
              id: requestId,
              imagingReportId: report.id,
              imagingReportVersionId: report.currentVersion!.id,
              imagingBookingId: booking.id,
              imagingOrgId: booking.imagingOrgId,
              countryId: booking.countryId,
              customerPersonId: booking.customerPersonId,
              customerAddressId: address.id,
              status: PhysicalReportRequestStatus.REQUESTED,
              deliveryAddressSnapshot: addressSnapshot,
              idempotencyKey,
              sandbox: true,
            },
          });
          await this.outbox.enqueue(tx, {
            type: 'PHYSICAL_REPORT_REQUESTED',
            aggregateType: 'ImagingPhysicalReportRequest',
            aggregateId: requestId,
            producer: 'radiology',
            countryId: booking.countryId,
            payload: {
              imaging_physical_report_request_id: requestId,
              imaging_booking_id: booking.id,
              customer_person_id: booking.customerPersonId,
              sandbox: true,
            },
            occurrenceKey: `imaging_physical_report_requested:${requestId}`,
          });
        });
      },
    );
    await this.security.emit({
      type: 'PHYSICAL_REPORT_REQUESTED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        imaging_physical_report_request_id: requestId,
        imaging_booking_id: booking.id,
        sandbox: true,
      },
    });
    const row = await this.loadRequest(requestId);
    return this.presentCustomerRequest(row);
  }

  async getCustomerPhysicalReport(bookingId: string, customerPersonId: string) {
    await this.loadCustomerBooking(bookingId, customerPersonId);
    const row = await this.prisma.imagingPhysicalReportRequest.findUnique({
      where: { imagingBookingId: bookingId },
      include: { logisticsJobs: true, imagingReportVersion: true },
    });
    if (!row) {
      throw Errors.notFound('No physical report request for this booking.');
    }
    if (row.customerPersonId !== customerPersonId) {
      throw Errors.forbidden('You cannot access another customer’s physical report request.');
    }
    return this.presentCustomerRequest(row);
  }

  async cancelCustomerRequest(principal: Principal, bookingId: string, reason?: string) {
    const booking = await this.loadCustomerBooking(bookingId, principal.personId);
    const row = await this.prisma.imagingPhysicalReportRequest.findUnique({
      where: { imagingBookingId: booking.id },
      include: { logisticsJobs: true, imagingReportVersion: true },
    });
    if (!row) {
      throw Errors.notFound('No physical report request for this booking.');
    }
    if (!isCancellablePhysicalReportStatus(row.status)) {
      throw Errors.problem(409, 'NOT_CANCELLABLE', 'Cannot cancel', `Status ${row.status} cannot be cancelled.`);
    }
    await this.transitionRequest({
      row,
      to: PhysicalReportRequestStatus.CANCELLED,
      actorPersonId: principal.personId,
      imagingOrgId: booking.imagingOrgId,
      cancelReason: reason ?? 'customer_cancelled',
      eventType: 'PHYSICAL_REPORT_CANCELLED',
    });
    return this.presentCustomerRequest(await this.loadRequest(row.id));
  }

  async listImagingOrgRequests(principal: Principal, imagingOrgId: string) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const rows = await this.prisma.imagingPhysicalReportRequest.findMany({
      where: { imagingOrgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { logisticsJobs: true, imagingReportVersion: true },
    });
    return { data: rows.map((row) => this.presentImagingOrgRequest(row)) };
  }

  async getImagingOrgRequest(principal: Principal, imagingOrgId: string, requestId: string) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const row = await this.assertRequestForImagingOrg(imagingOrgId, requestId);
    return this.presentImagingOrgRequest(row);
  }

  async acceptRequest(principal: Principal, imagingOrgId: string, requestId: string) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const row = await this.assertRequestForImagingOrg(imagingOrgId, requestId);
    return this.transitionRequest({
      row,
      to: PhysicalReportRequestStatus.ACCEPTED,
      actorPersonId: principal.personId,
      imagingOrgId,
      eventType: 'PHYSICAL_REPORT_ACCEPTED',
    });
  }

  async prepareRequest(principal: Principal, imagingOrgId: string, requestId: string) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const row = await this.assertRequestForImagingOrg(imagingOrgId, requestId);
    return this.transitionRequest({
      row,
      to: PhysicalReportRequestStatus.PREPARING,
      actorPersonId: principal.personId,
      imagingOrgId,
      eventType: 'PHYSICAL_REPORT_PREPARING',
    });
  }

  async packRequest(
    principal: Principal,
    imagingOrgId: string,
    requestId: string,
    sealedPackageId: string,
  ) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    if (!sealedPackageId?.trim()) {
      throw Errors.validation('sealed_package_id is required.');
    }
    const row = await this.assertRequestForImagingOrg(imagingOrgId, requestId);
    return this.transitionRequest({
      row,
      to: PhysicalReportRequestStatus.PACKED,
      actorPersonId: principal.personId,
      imagingOrgId,
      sealedPackageId: sealedPackageId.trim(),
      eventType: 'PHYSICAL_REPORT_PACKED',
    });
  }

  async dispatchRequest(principal: Principal, imagingOrgId: string, requestId: string, idempotencyKey?: string) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const row = await this.assertRequestForImagingOrg(imagingOrgId, requestId);
    if (row.status === PhysicalReportRequestStatus.DISPATCHED) {
      return this.presentImagingOrgRequest(row);
    }
    assertPhysicalReportTransition(row.status, PhysicalReportRequestStatus.DISPATCHED);
    const booking = await this.prisma.imagingBooking.findUniqueOrThrow({ where: { id: row.imagingBookingId } });
    const jobId = uuidv7();
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: row.countryId,
        organizationId: imagingOrgId,
        personId: principal.personId,
      }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.imagingPhysicalReportRequest.update({
            where: { id: row.id },
            data: { status: PhysicalReportRequestStatus.DISPATCHED },
          });
          await tx.logisticsJob.create({
            data: {
              id: jobId,
              imagingPhysicalReportRequestId: row.id,
              jobType: LogisticsJobType.REPORT_DELIVERY,
              status: LogisticsJobStatus.CREATED,
              payload: {
                imaging_physical_report_request_id: row.id,
                imaging_booking_id: row.imagingBookingId,
                imaging_org_id: imagingOrgId,
                country_id: row.countryId,
                sealed_package_id: row.sealedPackageId,
                sandbox: true,
              },
            },
          });
          await this.outbox.enqueue(tx, {
            type: 'PHYSICAL_REPORT_DISPATCHED',
            aggregateType: 'ImagingPhysicalReportRequest',
            aggregateId: row.id,
            producer: 'radiology',
            countryId: row.countryId,
            payload: {
              imaging_physical_report_request_id: row.id,
              imaging_booking_id: row.imagingBookingId,
              logistics_job_id: jobId,
              customer_person_id: row.customerPersonId,
              sandbox: true,
            },
            occurrenceKey: idempotencyKey ?? `imaging_physical_report_dispatched:${row.id}`,
          });
        });
        await this.finance.recordSandboxImagingReportDeliveryFee({
          countryId: row.countryId,
          imagingPhysicalReportRequestId: row.id,
          amountMinor: SANDBOX_REPORT_DELIVERY_FEE_MINOR,
          currency: booking.currency,
        });
      },
    );
    await this.security.emit({
      type: 'PHYSICAL_REPORT_DISPATCHED',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        imaging_physical_report_request_id: row.id,
        logistics_job_id: jobId,
        sandbox: true,
      },
    });
    const updated = await this.loadRequest(row.id);
    return this.presentImagingOrgRequest(updated);
  }

  async cancelImagingOrgRequest(principal: Principal, imagingOrgId: string, requestId: string, reason?: string) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const row = await this.assertRequestForImagingOrg(imagingOrgId, requestId);
    if (!isCancellablePhysicalReportStatus(row.status)) {
      throw Errors.problem(409, 'NOT_CANCELLABLE', 'Cannot cancel', `Status ${row.status} cannot be cancelled.`);
    }
    return this.transitionRequest({
      row,
      to: PhysicalReportRequestStatus.CANCELLED,
      actorPersonId: principal.personId,
      imagingOrgId,
      cancelReason: reason ?? 'imaging_center_cancelled',
      eventType: 'PHYSICAL_REPORT_CANCELLED',
    });
  }

  async failRequest(principal: Principal, imagingOrgId: string, requestId: string, reason: string, code?: string) {
    await assertImagingOrgAccess(this.prisma, principal, imagingOrgId);
    const row = await this.assertRequestForImagingOrg(imagingOrgId, requestId);
    return this.transitionRequest({
      row,
      to: PhysicalReportRequestStatus.FAILED,
      actorPersonId: principal.personId,
      imagingOrgId,
      failureReason: reason,
      failureCode: code ?? 'ops_failed',
      eventType: 'PHYSICAL_REPORT_FAILED',
    });
  }

  async markDeliveredFromJob(actorPersonId: string, jobId: string, idempotencyKey?: string) {
    const job = await this.prisma.logisticsJob.findUniqueOrThrow({ where: { id: jobId } });
    if (job.jobType !== LogisticsJobType.REPORT_DELIVERY || !job.imagingPhysicalReportRequestId) {
      throw Errors.validation('Not an imaging report delivery job.');
    }
    if (job.assigneeId && job.assigneeId !== actorPersonId) {
      throw Errors.forbidden('You cannot deliver another rider’s job.');
    }
    const payload = (job.payload ?? {}) as Record<string, string>;
    const requestId = job.imagingPhysicalReportRequestId ?? payload.imaging_physical_report_request_id;
    const tenantOrgId = payload.imaging_org_id;
    const tenantCountryId = payload.country_id;
    if (!tenantOrgId || !tenantCountryId) {
      throw Errors.validation('Report delivery job missing tenant payload.');
    }
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: tenantCountryId,
        organizationId: tenantOrgId,
        personId: actorPersonId,
      }),
      async () => {
        const row = await this.loadRequest(requestId);
        if (row.status === PhysicalReportRequestStatus.DELIVERED) {
          return;
        }
        assertPhysicalReportTransition(row.status, PhysicalReportRequestStatus.DELIVERED);
        await this.prisma.$transaction(async (tx) => {
          await tx.imagingPhysicalReportRequest.update({
            where: { id: row.id },
            data: { status: PhysicalReportRequestStatus.DELIVERED },
          });
          await tx.logisticsJob.update({
            where: { id: jobId },
            data: { status: LogisticsJobStatus.DELIVERED },
          });
          await this.outbox.enqueue(tx, {
            type: 'PHYSICAL_REPORT_DELIVERED',
            aggregateType: 'ImagingPhysicalReportRequest',
            aggregateId: row.id,
            producer: 'radiology',
            countryId: row.countryId,
            payload: {
              imaging_physical_report_request_id: row.id,
              imaging_booking_id: row.imagingBookingId,
              customer_person_id: row.customerPersonId,
              logistics_job_id: jobId,
              sandbox: true,
            },
            occurrenceKey: idempotencyKey ?? `imaging_physical_report_delivered:${jobId}`,
          });
        });
      },
    );
    await this.security.emit({
      type: 'PHYSICAL_REPORT_DELIVERED',
      outcome: 'success',
      personId: actorPersonId,
      metadata: { imaging_physical_report_request_id: requestId, logistics_job_id: jobId, sandbox: true },
    });
    return this.presentTransportJob(jobId);
  }

  async markDeliveryFailedFromJob(actorPersonId: string, jobId: string, reason: string) {
    const job = await this.prisma.logisticsJob.findUniqueOrThrow({ where: { id: jobId } });
    if (job.jobType !== LogisticsJobType.REPORT_DELIVERY || !job.imagingPhysicalReportRequestId) {
      throw Errors.validation('Not an imaging report delivery job.');
    }
    if (job.assigneeId && job.assigneeId !== actorPersonId) {
      throw Errors.forbidden('You cannot update another rider’s job.');
    }
    const payload = (job.payload ?? {}) as Record<string, string>;
    const requestId = job.imagingPhysicalReportRequestId ?? payload.imaging_physical_report_request_id;
    const tenantOrgId = payload.imaging_org_id;
    const tenantCountryId = payload.country_id;
    if (!tenantOrgId || !tenantCountryId) {
      throw Errors.validation('Report delivery job missing tenant payload.');
    }
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: tenantCountryId,
        organizationId: tenantOrgId,
        personId: actorPersonId,
      }),
      async () => {
        const row = await this.loadRequest(requestId);
        if (row.status === PhysicalReportRequestStatus.FAILED) {
          return;
        }
        if (row.status === PhysicalReportRequestStatus.DELIVERED) {
          throw Errors.problem(409, 'ALREADY_DELIVERED', 'Already delivered', 'Request already delivered.');
        }
        await this.prisma.$transaction(async (tx) => {
          await tx.imagingPhysicalReportRequest.update({
            where: { id: row.id },
            data: {
              status: PhysicalReportRequestStatus.FAILED,
              failureReason: reason,
              failureCode: 'delivery_failed',
            },
          });
          await tx.logisticsJob.update({
            where: { id: jobId },
            data: { status: LogisticsJobStatus.FAILED },
          });
          await this.outbox.enqueue(tx, {
            type: 'PHYSICAL_REPORT_FAILED',
            aggregateType: 'ImagingPhysicalReportRequest',
            aggregateId: row.id,
            producer: 'radiology',
            countryId: row.countryId,
            payload: {
              imaging_physical_report_request_id: row.id,
              imaging_booking_id: row.imagingBookingId,
              customer_person_id: row.customerPersonId,
              reason_code: 'delivery_failed',
              sandbox: true,
            },
            occurrenceKey: `imaging_physical_report_failed:${jobId}`,
          });
        });
      },
    );
    await this.security.emit({
      type: 'PHYSICAL_REPORT_FAILED',
      outcome: 'failure',
      personId: actorPersonId,
      metadata: { imaging_physical_report_request_id: requestId, logistics_job_id: jobId, sandbox: true },
    });
    return this.presentTransportJob(jobId);
  }

  async listAdminMetadata(imagingOrgId?: string) {
    const rows = await this.prisma.imagingPhysicalReportRequest.findMany({
      where: imagingOrgId ? { imagingOrgId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        imagingBookingId: true,
        imagingOrgId: true,
        status: true,
        sealedPackageId: true,
        sandbox: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return {
      data: rows.map((row) => ({
        id: row.id,
        imaging_booking_id: row.imagingBookingId,
        imaging_org_id: row.imagingOrgId,
        status: row.status,
        sealed_package_id: row.sealedPackageId,
        sandbox: row.sandbox,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
      })),
    };
  }

  presentReportDeliveryJob(row: {
    id: string;
    status: LogisticsJobStatus;
    assigneeId: string | null;
    payload: unknown;
    createdAt: Date;
    imagingPhysicalReportRequest?: {
      sealedPackageId: string | null;
      deliveryAddressSnapshot: unknown;
      status: string;
    } | null;
  }) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const address = (row.imagingPhysicalReportRequest?.deliveryAddressSnapshot ?? {}) as Record<string, string>;
    return {
      id: row.id,
      shipment_id: null,
      job_type: LogisticsJobType.REPORT_DELIVERY,
      status: row.status,
      assignee_id: row.assigneeId,
      tracking_number:
        row.imagingPhysicalReportRequest?.sealedPackageId ?? (payload.sealed_package_id as string) ?? null,
      shipment_status: row.imagingPhysicalReportRequest?.status ?? null,
      parcel_label: 'Sealed imaging report parcel',
      dropoff: {
        city: address.city ?? null,
        region: address.region ?? address.city ?? null,
        recipient: address.recipient_name ? maskName(address.recipient_name) : null,
      },
      sandbox: true,
      created_at: row.createdAt,
      note: 'Sealed report parcel. No diagnostic content.',
    };
  }

  private async transitionRequest(input: {
    row: RequestRow;
    to: PhysicalReportRequestStatus;
    actorPersonId: string;
    imagingOrgId: string;
    sealedPackageId?: string;
    cancelReason?: string;
    failureReason?: string;
    failureCode?: string;
    eventType: string;
  }) {
    if (input.row.status === input.to) {
      return this.presentImagingOrgRequest(input.row);
    }
    assertPhysicalReportTransition(input.row.status, input.to);
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: input.row.countryId,
        organizationId: input.imagingOrgId,
        personId: input.actorPersonId,
      }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.imagingPhysicalReportRequest.update({
            where: { id: input.row.id },
            data: {
              status: input.to,
              ...(input.sealedPackageId ? { sealedPackageId: input.sealedPackageId } : {}),
              ...(input.cancelReason ? { cancelReason: input.cancelReason } : {}),
              ...(input.failureReason ? { failureReason: input.failureReason } : {}),
              ...(input.failureCode ? { failureCode: input.failureCode } : {}),
            },
          });
          await this.outbox.enqueue(tx, {
            type: input.eventType,
            aggregateType: 'ImagingPhysicalReportRequest',
            aggregateId: input.row.id,
            producer: 'radiology',
            countryId: input.row.countryId,
            payload: {
              imaging_physical_report_request_id: input.row.id,
              imaging_booking_id: input.row.imagingBookingId,
              customer_person_id: input.row.customerPersonId,
              status: input.to,
              sandbox: true,
            },
            occurrenceKey: `${input.eventType.toLowerCase()}:${input.row.id}:${input.to}`,
          });
        });
      },
    );
    await this.security.emit({
      type: input.eventType as 'PHYSICAL_REPORT_ACCEPTED',
      outcome: input.to === PhysicalReportRequestStatus.FAILED ? 'failure' : 'success',
      personId: input.actorPersonId,
      metadata: {
        imaging_physical_report_request_id: input.row.id,
        status: input.to,
        sandbox: true,
      },
    });
    const updated = await this.loadRequest(input.row.id);
    return input.row.customerPersonId === input.actorPersonId
      ? this.presentCustomerRequest(updated)
      : this.presentImagingOrgRequest(updated);
  }

  private async physicalReportPackGate(countryCode: string) {
    const resolved = await this.policy.resolvePublished(countryCode);
    const document = resolved?.document ?? null;
    if (!document) {
      return { ok: false as const, reason: 'No published country pack.' };
    }
    if (!this.policy.canUseService(document, 'physical_report_delivery')) {
      return { ok: false as const, reason: 'physical_report_delivery disabled.' };
    }
    return { ok: true as const, reason: null };
  }

  private async loadCustomerBooking(bookingId: string, customerPersonId: string) {
    const booking = await this.prisma.imagingBooking.findUnique({ where: { id: bookingId } });
    if (!booking) {
      throw Errors.notFound('Imaging booking not found.');
    }
    if (booking.customerPersonId !== customerPersonId) {
      throw Errors.forbidden('You cannot access another customer’s imaging booking.');
    }
    return booking;
  }

  private async assertRequestForImagingOrg(imagingOrgId: string, requestId: string) {
    const row = await this.loadRequest(requestId);
    if (row.imagingOrgId !== imagingOrgId) {
      throw Errors.forbidden('Physical report request belongs to another imaging center.');
    }
    return row;
  }

  private loadRequest(requestId: string) {
    return this.prisma.imagingPhysicalReportRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { logisticsJobs: true, imagingReportVersion: true },
    });
  }

  private presentCustomerRequest(row: RequestRow) {
    const job = row.logisticsJobs[0] ?? null;
    return {
      id: row.id,
      imaging_booking_id: row.imagingBookingId,
      status: row.status,
      sealed_package_id: row.sealedPackageId,
      logistics_job_id: job?.id ?? null,
      logistics_job_status: job?.status ?? null,
      failure_reason: row.failureReason,
      failure_code: row.failureCode,
      cancel_reason: row.cancelReason,
      sandbox: row.sandbox,
      sandbox_delivery_fee_minor: '500',
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      note: 'Physical report delivery tracking only. Digital report access is unchanged.',
    };
  }

  private presentImagingOrgRequest(row: RequestRow) {
    const job = row.logisticsJobs[0] ?? null;
    return {
      id: row.id,
      imaging_booking_id: row.imagingBookingId,
      imaging_report_id: row.imagingReportId,
      imaging_report_version_id: row.imagingReportVersionId,
      report_version_number: row.imagingReportVersion.versionNumber,
      customer_person_id: row.customerPersonId,
      status: row.status,
      sealed_package_id: row.sealedPackageId,
      logistics_job_id: job?.id ?? null,
      logistics_job_status: job?.status ?? null,
      failure_reason: row.failureReason,
      cancel_reason: row.cancelReason,
      sandbox: row.sandbox,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }

  private async presentTransportJob(jobId: string) {
    const job = await this.prisma.logisticsJob.findUniqueOrThrow({
      where: { id: jobId },
      include: { imagingPhysicalReportRequest: true },
    });
    return this.presentReportDeliveryJob(job);
  }
}

function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) {
    return `${parts[0]?.slice(0, 1) ?? ''}***`;
  }
  return `${parts[0]} ${parts[parts.length - 1]?.slice(0, 1) ?? ''}.`;
}

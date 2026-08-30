import { Injectable } from '@nestjs/common';
import {
  LabBookingStatus,
  LabSampleCocStatus,
  LogisticsJobStatus,
  LogisticsJobType,
  OrganizationKind,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { assertLabOrgAccess } from '../catalog/access';
import { PolicyResolver } from '../policy/resolver';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { assertCocTransition } from './lab-sample-coc-status';

function maskName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Customer';
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return `${parts[0]![0] ?? 'C'}***`;
  }
  return `${parts[0]} ${parts[parts.length - 1]![0] ?? ''}***`;
}

@Injectable()
export class SampleCollectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly outbox: OutboxService,
    private readonly security: SecurityEventsService,
  ) {}

  /** Idempotent: create sample + SAMPLE_COLLECTION job when booking becomes CONFIRMED. */
  async enqueueForConfirmedBooking(labBookingId: string, actorPersonId: string): Promise<void> {
    const existing = await this.prisma.labSample.findUnique({ where: { labBookingId } });
    if (existing) {
      return;
    }
    const booking = await this.prisma.labBooking.findUnique({
      where: { id: labBookingId },
      include: { country: { select: { isoAlpha2: true } } },
    });
    if (!booking || booking.status !== LabBookingStatus.CONFIRMED) {
      return;
    }
    const gate = await this.collectionPackGate(booking.country.isoAlpha2, booking.collectionMode);
    if (!gate.ok) {
      return;
    }
    const sampleId = uuidv7();
    const jobId = uuidv7();
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: booking.countryId,
        organizationId: booking.labOrgId,
        personId: actorPersonId,
      }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.labSample.create({
            data: {
              id: sampleId,
              labBookingId: booking.id,
              labOrgId: booking.labOrgId,
              countryId: booking.countryId,
              status: LabSampleCocStatus.ASSIGNED,
              sandbox: true,
            },
          });
          await tx.labSampleCocEvent.create({
            data: {
              id: uuidv7(),
              labSampleId: sampleId,
              fromStatus: null,
              toStatus: LabSampleCocStatus.ASSIGNED,
              actorPersonId,
              actionCode: 'sample_assigned',
              sourceKind: 'SYSTEM',
              destinationKind: 'PHLEBOTOMIST_QUEUE',
              metadata: { lab_booking_id: booking.id, sandbox: true },
            },
          });
          await tx.logisticsJob.create({
            data: {
              id: jobId,
              labSampleId: sampleId,
              jobType: LogisticsJobType.SAMPLE_COLLECTION,
              status: LogisticsJobStatus.CREATED,
              payload: {
                lab_booking_id: booking.id,
                lab_org_id: booking.labOrgId,
                collection_mode: booking.collectionMode,
                sandbox: true,
              },
            },
          });
          await this.outbox.enqueue(tx, {
            type: 'LAB_SAMPLE_ASSIGNED',
            aggregateType: 'LabSample',
            aggregateId: sampleId,
            producer: 'lab',
            countryId: booking.countryId,
            payload: {
              lab_booking_id: booking.id,
              lab_org_id: booking.labOrgId,
              customer_person_id: booking.customerPersonId,
              status: LabSampleCocStatus.ASSIGNED,
              sandbox: true,
            },
            occurrenceKey: `lab_sample_assigned:${sampleId}`,
          });
        });
      },
    );
    await this.security.emit({
      type: 'LAB_SAMPLE_ASSIGNED',
      outcome: 'success',
      personId: actorPersonId,
      metadata: { lab_booking_id: booking.id, lab_sample_id: sampleId, lab_org_id: booking.labOrgId, sandbox: true },
    });
  }

  async assignPhlebotomist(
    actorPersonId: string,
    labOrgId: string,
    labSampleId: string,
    assigneePersonId: string,
  ) {
    await this.assertLabOrgOperator(actorPersonId, labOrgId);
    const sample = await this.loadSample(labSampleId);
    if (sample.labOrgId !== labOrgId) {
      throw Errors.forbidden('Sample does not belong to this laboratory.');
    }
    if (sample.status !== LabSampleCocStatus.ASSIGNED && sample.status !== LabSampleCocStatus.RECOLLECTION_REQUIRED) {
      throw Errors.problem(409, 'SAMPLE_NOT_ASSIGNABLE', 'Not assignable', 'Sample is not awaiting phlebotomist assignment.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.labSample.update({
        where: { id: sample.id },
        data: { assigneePersonId },
      });
      const job = await tx.logisticsJob.findFirst({
        where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_COLLECTION },
      });
      if (job) {
        await tx.logisticsJob.update({
          where: { id: job.id },
          data: { assigneeId: assigneePersonId, status: LogisticsJobStatus.ASSIGNED },
        });
      }
    });
    await this.security.emit({
      type: 'LAB_SAMPLE_PHLEBOTOMIST_ASSIGNED',
      outcome: 'success',
      personId: actorPersonId,
      metadata: { lab_sample_id: sample.id, assignee_person_id: assigneePersonId, lab_org_id: labOrgId, sandbox: true },
    });
    return this.getSampleForLab(labOrgId, labSampleId);
  }

  async listPhlebotomistJobs(principal: Principal) {
    await this.assertPhlebotomist(principal);
    const rows = await this.prisma.logisticsJob.findMany({
      where: {
        jobType: LogisticsJobType.SAMPLE_COLLECTION,
        OR: [{ assigneeId: principal.personId }, { assigneeId: null, status: LogisticsJobStatus.CREATED }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { labSample: { include: { booking: { include: { lines: true, country: true } } } } },
    });
    return {
      data: rows
        .filter((row) => row.assigneeId === principal.personId || row.assigneeId === null)
        .map((row) => this.presentPhlebotomistJob(row, principal.personId)),
    };
  }

  async getPhlebotomistJob(principal: Principal, jobId: string) {
    await this.assertPhlebotomist(principal);
    const row = await this.loadCollectionJob(jobId);
    this.assertJobAssignee(principal, row);
    return this.presentPhlebotomistJob(row, principal.personId);
  }

  async acceptJob(principal: Principal, jobId: string) {
    const row = await this.loadCollectionJob(jobId);
    if (row.assigneeId && row.assigneeId !== principal.personId) {
      throw Errors.forbidden('This collection job is assigned to another phlebotomist.');
    }
    if (!row.labSampleId || !row.labSample) {
      throw Errors.notFound('Sample not linked to job.');
    }
    await this.prisma.labSample.update({
      where: { id: row.labSample.id },
      data: { assigneePersonId: principal.personId },
    });
    await this.transitionCoc(row.labSample, LabSampleCocStatus.ACCEPTED, principal.personId, 'job_accepted', {
      idempotencyKey: `accept:${jobId}:${principal.personId}`,
      sourceKind: 'PHLEBOTOMIST',
    });
    const updated = await this.prisma.logisticsJob.update({
      where: { id: jobId },
      data: { assigneeId: principal.personId, status: LogisticsJobStatus.ASSIGNED },
      include: { labSample: { include: { booking: { include: { lines: true, country: true } } } } },
    });
    return this.presentPhlebotomistJob(updated, principal.personId);
  }

  async cocTransition(
    principal: Principal,
    jobId: string,
    toStatus: LabSampleCocStatus,
    input: {
      actionCode: string;
      idempotencyKey?: string;
      containerBarcode?: string;
      exceptionCode?: string;
      sourceKind?: string;
      destinationKind?: string;
    },
  ) {
    const row = await this.loadCollectionJob(jobId);
    this.assertJobAssignee(principal, row, true);
    if (!row.labSample) {
      throw Errors.notFound('Sample not found.');
    }
    const metadata: Record<string, unknown> = { sandbox: true };
    if (input.exceptionCode) {
      metadata.exception_code = input.exceptionCode;
    }
    await this.transitionCoc(row.labSample, toStatus, principal.personId, input.actionCode, {
      idempotencyKey: input.idempotencyKey,
      sourceKind: input.sourceKind ?? 'PHLEBOTOMIST',
      destinationKind: input.destinationKind,
      metadata,
      containerBarcode: input.containerBarcode,
    });
    const refreshed = await this.loadCollectionJob(jobId);
    return this.presentPhlebotomistJob(refreshed, principal.personId);
  }

  async listLabCollections(principal: Principal, labOrgId: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const rows = await this.prisma.labSample.findMany({
      where: { labOrgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        booking: { include: { lines: true, country: true } },
        cocEvents: { orderBy: { createdAt: 'asc' }, take: 20 },
      },
    });
    return {
      data: rows.map((row) => this.presentLabSample(row)),
      note: 'Collection queue visibility only. Accession/pathology remain R7-D+.',
    };
  }

  async getLabCollection(principal: Principal, labOrgId: string, sampleId: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    return this.getSampleForLab(labOrgId, sampleId);
  }

  async getCustomerCollection(principal: Principal, labBookingId: string) {
    const booking = await this.prisma.labBooking.findUnique({ where: { id: labBookingId } });
    if (!booking || booking.customerPersonId !== principal.personId) {
      throw Errors.forbidden('You cannot access another customer’s lab booking.');
    }
    const sample = await this.prisma.labSample.findUnique({
      where: { labBookingId },
      include: { cocEvents: { orderBy: { createdAt: 'asc' } } },
    });
    if (!sample) {
      return {
        lab_booking_id: labBookingId,
        collection_started: false,
        status: null,
        custody_timeline: [],
        note: 'Sample collection has not started yet.',
      };
    }
    return this.presentCustomerCollection(sample);
  }

  private async getSampleForLab(labOrgId: string, sampleId: string) {
    const sample = await this.prisma.labSample.findUnique({
      where: { id: sampleId },
      include: {
        booking: { include: { lines: true, country: true } },
        cocEvents: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!sample || sample.labOrgId !== labOrgId) {
      throw Errors.forbidden('Sample not found for this laboratory.');
    }
    return this.presentLabSample(sample);
  }

  private async transitionCoc(
    sample: { id: string; status: LabSampleCocStatus; labOrgId: string; countryId: string; labBookingId: string },
    toStatus: LabSampleCocStatus,
    actorPersonId: string,
    actionCode: string,
    opts: {
      idempotencyKey?: string;
      sourceKind?: string;
      destinationKind?: string;
      metadata?: Record<string, unknown>;
      containerBarcode?: string;
    },
  ) {
    if (opts.idempotencyKey) {
      const prior = await this.prisma.labSampleCocEvent.findUnique({
        where: { idempotencyKey: opts.idempotencyKey },
      });
      if (prior) {
        return;
      }
    }
    assertCocTransition(sample.status, toStatus);
    const customerPersonId = await this.resolveBookingCustomerPersonId(sample.labBookingId);
    await this.prisma.$transaction(async (tx) => {
      await tx.labSample.update({
        where: { id: sample.id },
        data: {
          status: toStatus,
          ...(opts.containerBarcode ? { containerBarcode: opts.containerBarcode } : {}),
        },
      });
      await tx.labSampleCocEvent.create({
        data: {
          id: uuidv7(),
          labSampleId: sample.id,
          fromStatus: sample.status,
          toStatus,
          actorPersonId,
          actionCode,
          sourceKind: opts.sourceKind,
          destinationKind: opts.destinationKind,
          metadata: (opts.metadata ?? { sandbox: true }) as Prisma.InputJsonValue,
          idempotencyKey: opts.idempotencyKey,
        },
      });
      const eventType = this.cocOutboxType(toStatus);
      await this.outbox.enqueue(tx, {
        type: eventType,
        aggregateType: 'LabSample',
        aggregateId: sample.id,
        producer: 'lab',
        countryId: sample.countryId,
        payload: {
          lab_booking_id: sample.labBookingId,
          lab_org_id: sample.labOrgId,
          customer_person_id: customerPersonId,
          status: toStatus,
          action_code: actionCode,
          sandbox: true,
        },
        occurrenceKey: `lab_sample_coc:${sample.id}:${toStatus}:${actionCode}:${opts.idempotencyKey ?? uuidv7()}`,
      });
    });
    await this.security.emit({
      type: 'LAB_SAMPLE_COC_TRANSITION',
      outcome: 'success',
      personId: actorPersonId,
      metadata: {
        lab_sample_id: sample.id,
        lab_booking_id: sample.labBookingId,
        from_status: sample.status,
        to_status: toStatus,
        action_code: actionCode,
        sandbox: true,
      },
    });
    if (toStatus === LabSampleCocStatus.HANDED_OVER) {
      await this.enqueueSampleTransport(sample, actorPersonId, customerPersonId);
    }
  }

  /** R7-D: public CoC transition for lab/delivery operators. */
  async applySampleCocTransition(
    actorPersonId: string,
    sampleId: string,
    toStatus: LabSampleCocStatus,
    input: {
      actionCode: string;
      idempotencyKey?: string;
      sourceKind?: string;
      destinationKind?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const sample = await this.loadSample(sampleId);
    await this.transitionCoc(sample, toStatus, actorPersonId, input.actionCode, input);
    return this.loadSample(sampleId);
  }

  private async enqueueSampleTransport(
    sample: { id: string; labOrgId: string; countryId: string; labBookingId: string },
    actorPersonId: string,
    customerPersonId: string,
  ) {
    const existing = await this.prisma.logisticsJob.findFirst({
      where: { labSampleId: sample.id, jobType: LogisticsJobType.SAMPLE_TRANSPORT },
    });
    if (existing) {
      return;
    }
    const jobId = uuidv7();
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: sample.countryId,
        organizationId: sample.labOrgId,
        personId: actorPersonId,
      }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.logisticsJob.create({
            data: {
              id: jobId,
              labSampleId: sample.id,
              jobType: LogisticsJobType.SAMPLE_TRANSPORT,
              status: LogisticsJobStatus.CREATED,
              payload: {
                lab_booking_id: sample.labBookingId,
                lab_org_id: sample.labOrgId,
                country_id: sample.countryId,
                sandbox: true,
              },
            },
          });
          await this.outbox.enqueue(tx, {
            type: 'LAB_SAMPLE_TRANSPORT_ENQUEUED',
            aggregateType: 'LabSample',
            aggregateId: sample.id,
            producer: 'lab',
            countryId: sample.countryId,
            payload: {
              lab_booking_id: sample.labBookingId,
              lab_org_id: sample.labOrgId,
              customer_person_id: customerPersonId,
              job_id: jobId,
              sandbox: true,
            },
            occurrenceKey: `lab_sample_transport:${sample.id}`,
          });
        });
      },
    );
  }

  private async resolveBookingCustomerPersonId(labBookingId: string): Promise<string> {
    const booking = await this.prisma.labBooking.findUniqueOrThrow({
      where: { id: labBookingId },
      select: { customerPersonId: true },
    });
    return booking.customerPersonId;
  }

  private cocOutboxType(status: LabSampleCocStatus): string {
    if (status === LabSampleCocStatus.HANDED_OVER) {
      return 'LAB_SAMPLE_HANDED_OVER';
    }
    if (status === LabSampleCocStatus.COLLECTED) {
      return 'LAB_SAMPLE_COLLECTED';
    }
    if (
      status === LabSampleCocStatus.REJECTED ||
      status === LabSampleCocStatus.LOST ||
      status === LabSampleCocStatus.DAMAGED
    ) {
      return 'LAB_SAMPLE_COLLECTION_FAILED';
    }
    return 'LAB_SAMPLE_COC_UPDATED';
  }

  private async collectionPackGate(countryCode: string, mode: string) {
    const resolved = await this.policy.resolvePublished(countryCode);
    const document = resolved?.document ?? null;
    if (!document) {
      return { ok: false as const, reason: 'No published country pack.' };
    }
    const home = this.policy.canUseService(document, 'lab_home');
    const center = this.policy.canUseService(document, 'lab_center');
    if (mode === 'HOME' && !home) {
      return { ok: false as const, reason: 'lab_home disabled.' };
    }
    if (mode === 'CENTER' && !center) {
      return { ok: false as const, reason: 'lab_center disabled.' };
    }
    return { ok: true as const, reason: null };
  }

  private async assertPhlebotomist(principal: Principal) {
    const partner = await this.prisma.partner.findFirst({
      where: { personId: principal.personId, partnerTypeCode: 'PHLEBOTOMIST' },
    });
    if (partner) {
      return;
    }
    const membership = await this.prisma.membership.count({
      where: {
        personId: principal.personId,
        status: 'ACTIVE',
        deletedAt: null,
        organization: { kind: OrganizationKind.LAB },
        role: { code: { in: ['org_staff', 'org_operations'] } },
      },
    });
    if (!membership) {
      throw Errors.forbidden('Phlebotomist access required.');
    }
  }

  private async assertLabOrgOperator(actorPersonId: string, labOrgId: string) {
    const membership = await this.prisma.membership.count({
      where: {
        personId: actorPersonId,
        organizationId: labOrgId,
        status: 'ACTIVE',
        deletedAt: null,
      },
    });
    if (!membership) {
      throw Errors.forbidden('Laboratory membership required to assign collections.');
    }
  }

  private async loadSample(id: string) {
    const row = await this.prisma.labSample.findUnique({ where: { id } });
    if (!row) {
      throw Errors.notFound('Lab sample not found.');
    }
    return row;
  }

  private async loadCollectionJob(jobId: string) {
    const row = await this.prisma.logisticsJob.findUnique({
      where: { id: jobId },
      include: { labSample: { include: { booking: { include: { lines: true, country: true } } } } },
    });
    if (!row || row.jobType !== LogisticsJobType.SAMPLE_COLLECTION) {
      throw Errors.notFound('Collection job not found.');
    }
    return row;
  }

  private assertJobAssignee(
    principal: Principal,
    row: { assigneeId: string | null },
    requireAssigned = false,
  ) {
    if (row.assigneeId && row.assigneeId !== principal.personId) {
      throw Errors.forbidden('You cannot access another phlebotomist’s job.');
    }
    if (requireAssigned && !row.assigneeId) {
      throw Errors.forbidden('Accept the job before performing collection actions.');
    }
  }

  private presentPhlebotomistJob(
    row: Prisma.LogisticsJobGetPayload<{
      include: { labSample: { include: { booking: { include: { lines: true; country: true } } } } };
    }>,
    viewerPersonId: string,
  ) {
    const sample = row.labSample;
    const booking = sample?.booking;
    const snapshot = booking?.addressSnapshot as { recipient_name?: string; city?: string; line1?: string } | null;
    return {
      id: row.id,
      job_type: row.jobType,
      status: row.status,
      assignee_id: row.assigneeId,
      is_mine: row.assigneeId === viewerPersonId,
      lab_sample_id: row.labSampleId,
      coc_status: sample?.status ?? null,
      collection_mode: booking?.collectionMode ?? null,
      slot_starts_at: booking?.slotStartsAt?.toISOString() ?? null,
      slot_ends_at: booking?.slotEndsAt?.toISOString() ?? null,
      test_title: booking?.lines[0]?.title ?? 'Lab test',
      customer_display: snapshot?.recipient_name ? maskName(snapshot.recipient_name) : 'Customer',
      city: snapshot?.city ?? null,
      line1_masked: snapshot?.line1 ? `${snapshot.line1.slice(0, 3)}***` : null,
      container_barcode: sample?.containerBarcode ?? null,
      sandbox: true,
      note: 'Minimum PII for collection routing only.',
      boundary: { creates_specimen: true, pathology: false, live_money: false },
    };
  }

  private presentLabSample(
    sample: Prisma.LabSampleGetPayload<{
      include: {
        booking: { include: { lines: true; country: true } };
        cocEvents: true;
      };
    }>,
  ) {
    return {
      id: sample.id,
      lab_booking_id: sample.labBookingId,
      status: sample.status,
      assignee_person_id: sample.assigneePersonId,
      container_barcode: sample.containerBarcode,
      collection_mode: sample.booking.collectionMode,
      test_title: sample.booking.lines[0]?.title ?? 'Lab test',
      slot_starts_at: sample.booking.slotStartsAt?.toISOString() ?? null,
      custody_timeline: sample.cocEvents.map((e) => ({
        id: e.id,
        from_status: e.fromStatus,
        to_status: e.toStatus,
        action_code: e.actionCode,
        created_at: e.createdAt.toISOString(),
      })),
      sandbox: sample.sandbox,
      note: 'Collection and custody visibility. Pathology remains R7-E+.',
    };
  }

  private presentCustomerCollection(
    sample: Prisma.LabSampleGetPayload<{ include: { cocEvents: true } }>,
  ) {
    return {
      lab_booking_id: sample.labBookingId,
      lab_sample_id: sample.id,
      collection_started: true,
      status: sample.status,
      custody_timeline: sample.cocEvents.map((e) => ({
        to_status: e.toStatus,
        action_code: e.actionCode,
        created_at: e.createdAt.toISOString(),
      })),
      note: 'Collection progress only. No clinical results.',
      boundary: { pathology: false, results_available: false },
    };
  }
}

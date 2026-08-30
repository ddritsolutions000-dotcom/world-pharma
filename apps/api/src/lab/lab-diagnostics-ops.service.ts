import { Injectable } from '@nestjs/common';
import {
  LabProcessingStatus,
  LabSampleCocStatus,
  LogisticsJobStatus,
  LogisticsJobType,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { SecurityEventsService } from '../identity/security-events.service';
import { assertLabOrgAccess } from '../catalog/access';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { assertProcessingTransition } from './lab-processing-status';
import { PathologyService } from './pathology.service';
import { SampleCollectionService } from './sample-collection.service';

function accessionNumberFor(labOrgId: string): string {
  return `ACC-${labOrgId.slice(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

@Injectable()
export class LabDiagnosticsOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collections: SampleCollectionService,
    private readonly outbox: OutboxService,
    private readonly security: SecurityEventsService,
    private readonly pathology: PathologyService,
  ) {}

  async listTransport(principal: Principal, labOrgId: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const rows = await this.prisma.logisticsJob.findMany({
      where: { jobType: LogisticsJobType.SAMPLE_TRANSPORT, labSample: { labOrgId } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        labSample: {
          include: { booking: { include: { lines: true } }, cocEvents: { orderBy: { createdAt: 'asc' }, take: 10 } },
        },
      },
    });
    return {
      data: rows.map((row) => this.presentTransportJob(row)),
      note: 'Sample transport queue. Mock carrier only; no live logistics.',
    };
  }

  async receiveAtLab(principal: Principal, labOrgId: string, sampleId: string, idempotencyKey?: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const sample = await this.assertSampleForLab(labOrgId, sampleId);
    if (sample.status !== LabSampleCocStatus.HANDED_OVER && sample.status !== LabSampleCocStatus.IN_TRANSIT) {
      throw Errors.problem(409, 'SAMPLE_NOT_RECEIVABLE', 'Not receivable', 'Sample is not awaiting lab receipt.');
    }
    await this.collections.applySampleCocTransition(principal.personId, sampleId, LabSampleCocStatus.LAB_RECEIVED, {
      actionCode: 'lab_received',
      idempotencyKey: idempotencyKey ?? `lab_receive:${sampleId}`,
      sourceKind: 'LAB_RECEIVING',
      destinationKind: 'LAB',
    });
    const transportJob = await this.prisma.logisticsJob.findFirst({
      where: { labSampleId: sampleId, jobType: LogisticsJobType.SAMPLE_TRANSPORT },
    });
    if (transportJob && transportJob.status !== LogisticsJobStatus.DELIVERED) {
      await this.prisma.logisticsJob.update({
        where: { id: transportJob.id },
        data: { status: LogisticsJobStatus.DELIVERED },
      });
    }
    return this.getSampleOpsView(labOrgId, sampleId);
  }

  async accessionSample(principal: Principal, labOrgId: string, sampleId: string, idempotencyKey?: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const sample = await this.assertSampleForLab(labOrgId, sampleId);
    const existing = await this.prisma.labAccession.findUnique({ where: { labSampleId: sampleId } });
    if (existing) {
      return this.presentAccession(existing.id);
    }
    if (sample.status !== LabSampleCocStatus.LAB_RECEIVED) {
      throw Errors.problem(409, 'SAMPLE_NOT_ACCESSIONABLE', 'Not accessionable', 'Receive sample at lab before accession.');
    }
    const accessionId = uuidv7();
    const processingId = uuidv7();
    const accessionNumber = accessionNumberFor(labOrgId);
    await this.prisma.runWithTenant(
      workerTenantContext({ countryId: sample.countryId, organizationId: labOrgId, personId: principal.personId }),
      async () => {
        await this.prisma.$transaction(async (tx) => {
          await tx.labAccession.create({
            data: {
              id: accessionId,
              labSampleId: sampleId,
              labOrgId,
              countryId: sample.countryId,
              accessionNumber,
              receivedAt: new Date(),
              acceptedAt: new Date(),
              sandbox: true,
            },
          });
          await tx.labProcessing.create({
            data: {
              id: processingId,
              labAccessionId: accessionId,
              labSampleId: sampleId,
              labOrgId,
              status: LabProcessingStatus.QUEUED,
              sandbox: true,
            },
          });
        });
      },
    );
    await this.collections.applySampleCocTransition(
      principal.personId,
      sampleId,
      LabSampleCocStatus.ACCEPTED_BY_LAB,
      {
        actionCode: 'accession_accepted',
        idempotencyKey: idempotencyKey ?? `accession:${sampleId}`,
        sourceKind: 'LAB_ACCESSION',
        destinationKind: 'LAB_BENCH',
        metadata: { accession_number: accessionNumber, sandbox: true },
      },
    );
    await this.security.emit({
      type: 'LAB_SAMPLE_COC_TRANSITION',
      outcome: 'success',
      personId: principal.personId,
      metadata: { lab_sample_id: sampleId, lab_org_id: labOrgId, accession_number: accessionNumber, sandbox: true },
    });
    return this.presentAccession(accessionId);
  }

  async listAccessions(principal: Principal, labOrgId: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const rows = await this.prisma.labAccession.findMany({
      where: { labOrgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        sample: { include: { booking: { include: { lines: true } }, cocEvents: { orderBy: { createdAt: 'asc' } } } },
        processing: true,
      },
    });
    return { data: rows.map((row) => this.presentAccessionRow(row)), note: 'Accession records only. No pathology results.' };
  }

  async getAccession(principal: Principal, labOrgId: string, accessionId: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const row = await this.prisma.labAccession.findUnique({
      where: { id: accessionId },
      include: {
        sample: { include: { booking: { include: { lines: true } }, cocEvents: { orderBy: { createdAt: 'asc' } } } },
        processing: true,
      },
    });
    if (!row || row.labOrgId !== labOrgId) {
      throw Errors.forbidden('Accession not found for this laboratory.');
    }
    return this.presentAccessionRow(row);
  }

  async listProcessing(principal: Principal, labOrgId: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const rows = await this.prisma.labProcessing.findMany({
      where: { labOrgId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        accession: true,
        sample: { include: { booking: { include: { lines: true } } } },
      },
    });
    return {
      data: rows.map((row) => this.presentProcessingRow(row)),
      note: 'Bench processing lifecycle only. No clinical interpretation in R7-D.',
    };
  }

  async getProcessing(principal: Principal, labOrgId: string, processingId: string) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const row = await this.prisma.labProcessing.findUnique({
      where: { id: processingId },
      include: {
        accession: true,
        sample: { include: { booking: { include: { lines: true } }, cocEvents: { orderBy: { createdAt: 'asc' } } } },
      },
    });
    if (!row || row.labOrgId !== labOrgId) {
      throw Errors.forbidden('Processing record not found for this laboratory.');
    }
    return this.presentProcessingRow(row);
  }

  async startProcessing(principal: Principal, labOrgId: string, processingId: string) {
    return this.transitionProcessing(principal, labOrgId, processingId, LabProcessingStatus.IN_PROGRESS, 'processing_started', {
      coc: LabSampleCocStatus.PROCESSING,
      cocAction: 'bench_processing_started',
    });
  }

  async completeProcessing(principal: Principal, labOrgId: string, processingId: string) {
    return this.transitionProcessing(principal, labOrgId, processingId, LabProcessingStatus.COMPLETED, 'processing_completed');
  }

  async holdProcessing(principal: Principal, labOrgId: string, processingId: string) {
    return this.transitionProcessing(principal, labOrgId, processingId, LabProcessingStatus.ON_HOLD, 'processing_on_hold');
  }

  async failProcessing(principal: Principal, labOrgId: string, processingId: string) {
    return this.transitionProcessing(principal, labOrgId, processingId, LabProcessingStatus.FAILED, 'processing_failed');
  }

  async transportPickup(actorPersonId: string, jobId: string, idempotencyKey?: string) {
    const job = await this.loadTransportJobBase(jobId);
    this.assertTransportAssignee(actorPersonId, job);
    if (!job.labSampleId) {
      throw Errors.notFound('Sample not linked.');
    }
    const tenant = this.transportTenantFromPayload(job.payload);
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: tenant.countryId,
        organizationId: tenant.organizationId,
        personId: actorPersonId,
      }),
      async () => {
        const sample = await this.prisma.labSample.findUniqueOrThrow({ where: { id: job.labSampleId! } });
        if (sample.status === LabSampleCocStatus.HANDED_OVER) {
          await this.collections.applySampleCocTransition(actorPersonId, sample.id, LabSampleCocStatus.IN_TRANSIT, {
            actionCode: 'transport_pickup',
            idempotencyKey: idempotencyKey ?? `transport_pickup:${jobId}`,
            sourceKind: 'PHLEBOTOMIST_HANDOFF',
            destinationKind: 'IN_TRANSIT',
          });
        }
      },
    );
    await this.prisma.logisticsJob.update({
      where: { id: jobId },
      data: { status: LogisticsJobStatus.PICKUP },
    });
    return this.presentTransportJobMinimal(jobId);
  }

  async transportDeliver(actorPersonId: string, jobId: string, idempotencyKey?: string) {
    const job = await this.loadTransportJobBase(jobId);
    this.assertTransportAssignee(actorPersonId, job);
    if (!job.labSampleId) {
      throw Errors.notFound('Sample not linked.');
    }
    const tenant = this.transportTenantFromPayload(job.payload);
    await this.prisma.runWithTenant(
      workerTenantContext({
        countryId: tenant.countryId,
        organizationId: tenant.organizationId,
        personId: actorPersonId,
      }),
      async () => {
        const sample = await this.prisma.labSample.findUniqueOrThrow({ where: { id: job.labSampleId! } });
        if (sample.status === LabSampleCocStatus.IN_TRANSIT) {
          await this.collections.applySampleCocTransition(actorPersonId, sample.id, LabSampleCocStatus.LAB_RECEIVED, {
            actionCode: 'transport_delivered',
            idempotencyKey: idempotencyKey ?? `transport_deliver:${jobId}`,
            sourceKind: 'IN_TRANSIT',
            destinationKind: 'LAB',
          });
        }
      },
    );
    await this.prisma.logisticsJob.update({
      where: { id: jobId },
      data: { status: LogisticsJobStatus.DELIVERED },
    });
    return this.presentTransportJobMinimal(jobId);
  }

  async getCustomerProgress(labBookingId: string, customerPersonId: string) {
    const booking = await this.prisma.labBooking.findUnique({ where: { id: labBookingId } });
    if (!booking || booking.customerPersonId !== customerPersonId) {
      throw Errors.forbidden('You cannot access another customer’s lab booking.');
    }
    const sample = await this.prisma.labSample.findUnique({
      where: { labBookingId },
      include: {
        cocEvents: { orderBy: { createdAt: 'asc' } },
        accession: { include: { processing: true } },
        labReport: { include: { currentVersion: true } },
      },
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
    return {
      lab_booking_id: labBookingId,
      lab_sample_id: sample.id,
      collection_started: true,
      status: sample.status,
      transport_in_progress: sample.status === LabSampleCocStatus.IN_TRANSIT,
      lab_received: (
        [
          LabSampleCocStatus.LAB_RECEIVED,
          LabSampleCocStatus.ACCEPTED_BY_LAB,
          LabSampleCocStatus.PROCESSING,
        ] as LabSampleCocStatus[]
      ).includes(sample.status),
      accession_number: sample.accession?.accessionNumber ?? null,
      processing_status: sample.accession?.processing?.status ?? null,
      report_status: sample.labReport?.currentVersion?.status ?? null,
      report_available: sample.labReport?.currentVersion?.status === 'PUBLISHED',
      custody_timeline: sample.cocEvents.map((e) => ({
        to_status: e.toStatus,
        action_code: e.actionCode,
        created_at: e.createdAt.toISOString(),
      })),
      note: 'Operational progress only. Open report when available.',
      boundary: {
        pathology: Boolean(sample.labReport),
        results_available: sample.labReport?.currentVersion?.status === 'PUBLISHED',
      },
    };
  }

  private async transitionProcessing(
    principal: Principal,
    labOrgId: string,
    processingId: string,
    toStatus: LabProcessingStatus,
    actionCode: string,
    coc?: { coc: LabSampleCocStatus; cocAction: string },
  ) {
    await assertLabOrgAccess(this.prisma, principal, labOrgId);
    const row = await this.prisma.labProcessing.findUnique({ where: { id: processingId } });
    if (!row || row.labOrgId !== labOrgId) {
      throw Errors.forbidden('Processing record not found for this laboratory.');
    }
    assertProcessingTransition(row.status, toStatus);
    await this.prisma.labProcessing.update({
      where: { id: processingId },
      data: {
        status: toStatus,
        ...(toStatus === LabProcessingStatus.IN_PROGRESS ? { startedAt: new Date() } : {}),
        ...(toStatus === LabProcessingStatus.COMPLETED ? { completedAt: new Date() } : {}),
      },
    });
    if (coc) {
      await this.collections.applySampleCocTransition(principal.personId, row.labSampleId, coc.coc, {
        actionCode: coc.cocAction,
        idempotencyKey: `${actionCode}:${processingId}`,
        sourceKind: 'LAB_BENCH',
      });
    }
    await this.security.emit({
      type: 'LAB_SAMPLE_COC_TRANSITION',
      outcome: 'success',
      personId: principal.personId,
      metadata: {
        lab_sample_id: row.labSampleId,
        lab_org_id: labOrgId,
        processing_status: toStatus,
        action_code: actionCode,
        sandbox: true,
      },
    });
    if (toStatus === LabProcessingStatus.COMPLETED) {
      await this.pathology.ensureDraftReportForProcessing(processingId, principal.personId);
    }
    return this.getProcessing(principal, labOrgId, processingId);
  }

  private async getSampleOpsView(labOrgId: string, sampleId: string) {
    const sample = await this.prisma.labSample.findUnique({
      where: { id: sampleId },
      include: {
        booking: { include: { lines: true, country: true } },
        cocEvents: { orderBy: { createdAt: 'asc' } },
        accession: { include: { processing: true } },
      },
    });
    if (!sample || sample.labOrgId !== labOrgId) {
      throw Errors.forbidden('Sample not found for this laboratory.');
    }
    return {
      id: sample.id,
      lab_booking_id: sample.labBookingId,
      status: sample.status,
      container_barcode: sample.containerBarcode,
      test_title: sample.booking.lines[0]?.title ?? 'Lab test',
      accession: sample.accession
        ? { id: sample.accession.id, accession_number: sample.accession.accessionNumber }
        : null,
      processing_status: sample.accession?.processing?.status ?? null,
      custody_timeline: sample.cocEvents.map((e) => ({
        id: e.id,
        from_status: e.fromStatus,
        to_status: e.toStatus,
        action_code: e.actionCode,
        created_at: e.createdAt.toISOString(),
      })),
      sandbox: sample.sandbox,
    };
  }

  private async presentAccession(accessionId: string) {
    const row = await this.prisma.labAccession.findUniqueOrThrow({
      where: { id: accessionId },
      include: {
        sample: { include: { booking: { include: { lines: true } }, cocEvents: { orderBy: { createdAt: 'asc' } } } },
        processing: true,
      },
    });
    return this.presentAccessionRow(row);
  }

  private presentAccessionRow(
    row: Prisma.LabAccessionGetPayload<{
      include: {
        sample: { include: { booking: { include: { lines: true } }; cocEvents: true } };
        processing: true;
      };
    }>,
  ) {
    return {
      id: row.id,
      lab_sample_id: row.labSampleId,
      lab_org_id: row.labOrgId,
      accession_number: row.accessionNumber,
      sample_status: row.sample.status,
      test_title: row.sample.booking.lines[0]?.title ?? 'Lab test',
      container_barcode: row.sample.containerBarcode,
      received_at: row.receivedAt?.toISOString() ?? null,
      accepted_at: row.acceptedAt?.toISOString() ?? null,
      processing_status: row.processing?.status ?? null,
      custody_timeline: row.sample.cocEvents.map((e) => ({
        id: e.id,
        to_status: e.toStatus,
        action_code: e.actionCode,
        created_at: e.createdAt.toISOString(),
      })),
      sandbox: row.sandbox,
      note: 'Accession metadata only. No pathology.',
    };
  }

  private presentProcessingRow(
    row: Prisma.LabProcessingGetPayload<{
      include: { accession: true; sample: { include: { booking: { include: { lines: true } } } } };
    }>,
  ) {
    return {
      id: row.id,
      lab_sample_id: row.labSampleId,
      lab_accession_id: row.labAccessionId,
      accession_number: row.accession.accessionNumber,
      status: row.status,
      test_title: row.sample.booking.lines[0]?.title ?? 'Lab test',
      container_barcode: row.sample.containerBarcode,
      started_at: row.startedAt?.toISOString() ?? null,
      completed_at: row.completedAt?.toISOString() ?? null,
      sandbox: row.sandbox,
      note: 'Bench status only. No result values.',
    };
  }

  private presentTransportJob(
    row: Prisma.LogisticsJobGetPayload<{
      include: { labSample: { include: { booking: { include: { lines: true } }; cocEvents: true } } };
    }>,
  ) {
    const sample = row.labSample;
    return {
      id: row.id,
      job_type: row.jobType,
      status: row.status,
      assignee_id: row.assigneeId,
      lab_sample_id: row.labSampleId,
      coc_status: sample?.status ?? null,
      container_barcode: sample?.containerBarcode ?? null,
      test_title: sample?.booking.lines[0]?.title ?? 'Lab test',
      custody_timeline: sample?.cocEvents.map((e) => ({
        to_status: e.toStatus,
        action_code: e.actionCode,
        created_at: e.createdAt.toISOString(),
      })),
      sandbox: true,
      note: 'Sealed container transport. No clinical data.',
    };
  }

  private async assertSampleForLab(labOrgId: string, sampleId: string) {
    const sample = await this.prisma.labSample.findUnique({ where: { id: sampleId } });
    if (!sample || sample.labOrgId !== labOrgId) {
      throw Errors.forbidden('Sample not found for this laboratory.');
    }
    return sample;
  }

  private transportTenantFromPayload(payload: Prisma.JsonValue) {
    const p = payload as { lab_org_id?: string; country_id?: string };
    if (!p.lab_org_id || !p.country_id) {
      throw Errors.problem(
        500,
        'TRANSPORT_PAYLOAD_INCOMPLETE',
        'Transport job misconfigured',
        'Sample transport job is missing tenant metadata.',
      );
    }
    return { organizationId: p.lab_org_id, countryId: p.country_id };
  }

  private async loadTransportJobBase(jobId: string) {
    const row = await this.prisma.logisticsJob.findUnique({ where: { id: jobId } });
    if (!row || row.jobType !== LogisticsJobType.SAMPLE_TRANSPORT) {
      throw Errors.notFound('Sample transport job not found.');
    }
    return row;
  }

  private async presentTransportJobMinimal(jobId: string) {
    const row = await this.loadTransportJobBase(jobId);
    return {
      id: row.id,
      job_type: row.jobType,
      status: row.status,
      assignee_id: row.assigneeId,
      lab_sample_id: row.labSampleId,
      sandbox: true,
      note: 'Sample transport update recorded.',
    };
  }

  private async loadTransportJob(jobId: string) {
    const row = await this.prisma.logisticsJob.findUnique({
      where: { id: jobId },
      include: {
        labSample: {
          include: { booking: { include: { lines: true } }, cocEvents: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });
    if (!row || row.jobType !== LogisticsJobType.SAMPLE_TRANSPORT) {
      throw Errors.notFound('Sample transport job not found.');
    }
    return row;
  }

  private assertTransportAssignee(actorPersonId: string, row: { assigneeId: string | null }) {
    if (!row.assigneeId || row.assigneeId !== actorPersonId) {
      throw Errors.forbidden('Accept the transport job before updating status.');
    }
  }
}

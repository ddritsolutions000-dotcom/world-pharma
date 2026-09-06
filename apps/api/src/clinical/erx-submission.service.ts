import { Injectable } from '@nestjs/common';
import { PrescriptionErxSubmissionStatus, type Prisma } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { OutboxService } from '../events/outbox.service';
import { PolicyResolver } from '../policy/resolver';
import { ErxRouter } from './erx-router';
import { assertProductionErxTransmissionAllowed } from './erx-production-activation-path';
import { readHealthcareEnvironment } from '../healthcare/healthcare-environment';

export type ErxSubmissionView = {
  id: string;
  prescription_id: string;
  prescription_version_id: string;
  country_id: string;
  provider_code: string;
  provider_ref: string | null;
  status: PrescriptionErxSubmissionStatus;
  reason_code: string | null;
  attempt_count: number;
  submitted_at: string | null;
  cancelled_at: string | null;
};

@Injectable()
export class ErxSubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyResolver,
    private readonly router: ErxRouter,
    private readonly outbox: OutboxService,
  ) {}

  /** Called after a prescription version is sealed (issue or amend). Fail-closed; non-blocking to issue. */
  async submitForIssuedVersion(input: {
    prescriptionVersionId: string;
    prescriptionId: string;
    countryId: string;
    countryCode: string;
    actorPersonId: string;
  }): Promise<ErxSubmissionView | null> {
    if (readHealthcareEnvironment() === 'production') {
      assertProductionErxTransmissionAllowed('erx.submitForIssuedVersion');
    }
    const resolved = await this.policy.resolvePublished(input.countryCode);
    const document = resolved?.document ?? null;
    if (!this.policy.isRxErxEnabled(document)) {
      return null;
    }

    const packProviderCode = this.policy.rxErxProviderCode(document);
    const existing = await this.prisma.prescriptionErxSubmission.findUnique({
      where: { prescriptionVersionId: input.prescriptionVersionId },
    });
    if (existing) {
      if (existing.status === PrescriptionErxSubmissionStatus.FAILED) {
        return this.retryExisting(existing, packProviderCode, input);
      }
      return this.present(existing);
    }

    const version = await this.prisma.prescriptionVersion.findUnique({
      where: { id: input.prescriptionVersionId },
      select: { id: true, sealedAt: true, prescriptionId: true },
    });
    if (!version?.sealedAt || version.prescriptionId !== input.prescriptionId) {
      return null;
    }

    const { adapter, providerCode } = this.router.resolveForPackProvider(packProviderCode);
    const runtimeReady = this.router.isRuntimeReady(packProviderCode);

    if (!packProviderCode || !runtimeReady) {
      return this.recordUnsupported({
        ...input,
        providerCode: providerCode || 'null',
        reasonCode: !packProviderCode
          ? 'pack_provider_code_missing'
          : 'runtime_provider_not_configured',
      });
    }

    const submissionId = uuidv7();
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.prescriptionErxSubmission.create({
        data: {
          id: submissionId,
          prescriptionId: input.prescriptionId,
          prescriptionVersionId: input.prescriptionVersionId,
          countryId: input.countryId,
          providerCode,
          status: PrescriptionErxSubmissionStatus.PENDING,
          attemptCount: 0,
          actorPersonId: input.actorPersonId,
        },
      });
      await this.securityEvent(tx, input.actorPersonId, 'PRESCRIPTION_ERX_SUBMIT_ATTEMPT', input.prescriptionId, {
        prescription_version_id: input.prescriptionVersionId,
        provider_code: providerCode,
      });
      await this.outbox.enqueue(tx, {
        type: 'PRESCRIPTION_ERX_SUBMISSION_PENDING',
        aggregateType: 'prescription_erx_submission',
        aggregateId: submissionId,
        producer: 'clinical',
        countryId: input.countryId,
        actorId: input.actorPersonId,
        payload: {
          prescription_id: input.prescriptionId,
          prescription_version_id: input.prescriptionVersionId,
          provider_code: providerCode,
        },
        occurrenceKey: `PRESCRIPTION_ERX_SUBMISSION_PENDING:${input.prescriptionVersionId}`,
      });
    });

    const result = await adapter.submit(input.prescriptionVersionId);
    if (result.status === 'submitted') {
      const row = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.prescriptionErxSubmission.update({
          where: { prescriptionVersionId: input.prescriptionVersionId },
          data: {
            status: PrescriptionErxSubmissionStatus.SUBMITTED,
            providerRef: result.providerRef,
            attemptCount: { increment: 1 },
            submittedAt: now,
            reasonCode: null,
          },
        });
        await this.securityEvent(tx, input.actorPersonId, 'PRESCRIPTION_ERX_SUBMITTED', input.prescriptionId, {
          prescription_version_id: input.prescriptionVersionId,
          provider_code: providerCode,
          provider_ref: result.providerRef,
        });
        await this.outbox.enqueue(tx, {
          type: 'PRESCRIPTION_ERX_SUBMITTED',
          aggregateType: 'prescription_erx_submission',
          aggregateId: updated.id,
          producer: 'clinical',
          countryId: input.countryId,
          actorId: input.actorPersonId,
          payload: {
            prescription_id: input.prescriptionId,
            prescription_version_id: input.prescriptionVersionId,
            provider_code: providerCode,
            provider_ref: result.providerRef,
          },
          occurrenceKey: `PRESCRIPTION_ERX_SUBMITTED:${input.prescriptionVersionId}`,
        });
        return updated;
      });
      return this.present(row);
    }

    const failed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.prescriptionErxSubmission.update({
        where: { prescriptionVersionId: input.prescriptionVersionId },
        data: {
          status: PrescriptionErxSubmissionStatus.UNSUPPORTED,
          attemptCount: { increment: 1 },
          reasonCode: result.reason.slice(0, 500),
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'PRESCRIPTION_ERX_UNSUPPORTED',
        aggregateType: 'prescription_erx_submission',
        aggregateId: updated.id,
        producer: 'clinical',
        countryId: input.countryId,
        actorId: input.actorPersonId,
        payload: {
          prescription_id: input.prescriptionId,
          prescription_version_id: input.prescriptionVersionId,
          provider_code: providerCode,
          reason_code: updated.reasonCode,
        },
        occurrenceKey: `PRESCRIPTION_ERX_UNSUPPORTED:${input.prescriptionVersionId}`,
      });
      return updated;
    });
    return this.present(failed);
  }

  /** Best-effort cancel for submitted e-Rx refs when prescription is cancelled. */
  async cancelForPrescription(input: {
    prescriptionId: string;
    countryCode: string;
    actorPersonId: string;
  }): Promise<void> {
    const resolved = await this.policy.resolvePublished(input.countryCode);
    if (!this.policy.isRxErxEnabled(resolved?.document ?? null)) {
      return;
    }

    const submissions = await this.prisma.prescriptionErxSubmission.findMany({
      where: {
        prescriptionId: input.prescriptionId,
        status: PrescriptionErxSubmissionStatus.SUBMITTED,
        providerRef: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    for (const row of submissions) {
      const packProviderCode = this.policy.rxErxProviderCode(resolved?.document ?? null);
      const { adapter } = this.router.resolveForPackProvider(packProviderCode);
      const cancelResult = await adapter.cancel(row.providerRef!);
      if (cancelResult.status === 'cancelled') {
        await this.prisma.$transaction(async (tx) => {
          await tx.prescriptionErxSubmission.update({
            where: { id: row.id },
            data: {
              status: PrescriptionErxSubmissionStatus.CANCELLED,
              cancelledAt: new Date(),
            },
          });
          await this.outbox.enqueue(tx, {
            type: 'PRESCRIPTION_ERX_CANCELLED',
            aggregateType: 'prescription_erx_submission',
            aggregateId: row.id,
            producer: 'clinical',
            countryId: row.countryId,
            actorId: input.actorPersonId,
            payload: {
              prescription_id: input.prescriptionId,
              prescription_version_id: row.prescriptionVersionId,
              provider_ref: row.providerRef,
            },
            occurrenceKey: `PRESCRIPTION_ERX_CANCELLED:${row.prescriptionVersionId}`,
          });
        });
      }
    }
  }

  private async recordUnsupported(input: {
    prescriptionVersionId: string;
    prescriptionId: string;
    countryId: string;
    actorPersonId: string;
    providerCode: string;
    reasonCode: string;
  }): Promise<ErxSubmissionView> {
    const existing = await this.prisma.prescriptionErxSubmission.findUnique({
      where: { prescriptionVersionId: input.prescriptionVersionId },
    });
    if (existing) {
      return this.present(existing);
    }

    const id = uuidv7();
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.prescriptionErxSubmission.create({
        data: {
          id,
          prescriptionId: input.prescriptionId,
          prescriptionVersionId: input.prescriptionVersionId,
          countryId: input.countryId,
          providerCode: input.providerCode,
          status: PrescriptionErxSubmissionStatus.UNSUPPORTED,
          reasonCode: input.reasonCode,
          attemptCount: 0,
          actorPersonId: input.actorPersonId,
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'PRESCRIPTION_ERX_UNSUPPORTED',
        aggregateType: 'prescription_erx_submission',
        aggregateId: id,
        producer: 'clinical',
        countryId: input.countryId,
        actorId: input.actorPersonId,
        payload: {
          prescription_id: input.prescriptionId,
          prescription_version_id: input.prescriptionVersionId,
          provider_code: input.providerCode,
          reason_code: input.reasonCode,
        },
        occurrenceKey: `PRESCRIPTION_ERX_UNSUPPORTED:${input.prescriptionVersionId}`,
      });
      return created;
    });
    return this.present(row);
  }

  private async retryExisting(
    existing: {
      id: string;
      prescriptionId: string;
      prescriptionVersionId: string;
      countryId: string;
      providerCode: string;
      attemptCount: number;
    },
    packProviderCode: string | null,
    input: { actorPersonId: string },
  ): Promise<ErxSubmissionView> {
    if (!this.router.isRuntimeReady(packProviderCode)) {
      return this.present(
        await this.prisma.prescriptionErxSubmission.findUniqueOrThrow({
          where: { id: existing.id },
        }),
      );
    }
    const { adapter } = this.router.resolveForPackProvider(packProviderCode);
    const result = await adapter.submit(existing.prescriptionVersionId);
    if (result.status !== 'submitted') {
      const row = await this.prisma.prescriptionErxSubmission.update({
        where: { id: existing.id },
        data: {
          status: PrescriptionErxSubmissionStatus.UNSUPPORTED,
          attemptCount: { increment: 1 },
          reasonCode: result.reason.slice(0, 500),
        },
      });
      return this.present(row);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.prescriptionErxSubmission.update({
        where: { id: existing.id },
        data: {
          status: PrescriptionErxSubmissionStatus.SUBMITTED,
          providerRef: result.providerRef,
          attemptCount: { increment: 1 },
          submittedAt: new Date(),
          reasonCode: null,
        },
      });
      await this.outbox.enqueue(tx, {
        type: 'PRESCRIPTION_ERX_SUBMITTED',
        aggregateType: 'prescription_erx_submission',
        aggregateId: updated.id,
        producer: 'clinical',
        countryId: existing.countryId,
        actorId: input.actorPersonId,
        payload: {
          prescription_id: existing.prescriptionId,
          prescription_version_id: existing.prescriptionVersionId,
          provider_code: existing.providerCode,
          provider_ref: result.providerRef,
        },
        occurrenceKey: `PRESCRIPTION_ERX_SUBMITTED:${existing.prescriptionVersionId}:retry`,
      });
      return updated;
    });
    return this.present(row);
  }

  private present(row: {
    id: string;
    prescriptionId: string;
    prescriptionVersionId: string;
    countryId: string;
    providerCode: string;
    providerRef: string | null;
    status: PrescriptionErxSubmissionStatus;
    reasonCode: string | null;
    attemptCount: number;
    submittedAt: Date | null;
    cancelledAt: Date | null;
  }): ErxSubmissionView {
    return {
      id: row.id,
      prescription_id: row.prescriptionId,
      prescription_version_id: row.prescriptionVersionId,
      country_id: row.countryId,
      provider_code: row.providerCode,
      provider_ref: row.providerRef,
      status: row.status,
      reason_code: row.reasonCode,
      attempt_count: row.attemptCount,
      submitted_at: row.submittedAt?.toISOString() ?? null,
      cancelled_at: row.cancelledAt?.toISOString() ?? null,
    };
  }

  private async securityEvent(
    tx: Prisma.TransactionClient,
    actorPersonId: string,
    eventType: string,
    prescriptionId: string,
    metadata: Record<string, unknown>,
  ) {
    await tx.securityEvent.create({
      data: {
        id: uuidv7(),
        type: eventType,
        personId: actorPersonId,
        outcome: 'success',
        metadata: { prescription_id: prescriptionId, ...metadata } as Prisma.InputJsonValue,
      },
    });
  }
}

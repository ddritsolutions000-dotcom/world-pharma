import { Injectable, Logger } from '@nestjs/common';
import {
  FinanceReconDomain,
  FinanceReconSourceKind,
  FinanceReconStatus,
  PaymentIntentStatus,
  Prisma,
  SettlementImportBatchStatus,
  SettlementImportRecordStatus,
  SettlementImportSource,
  SettlementMatchClassification,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { FinanceService } from './finance.service';
import {
  assertSettlementImportAllowed,
  assertSettlementProviderRegistered,
  readSettlementEnvironment,
} from './settlement-import.config';
import type { SettlementImportBatchPayload, SettlementImportRecordInput } from './settlement-import.port';
import { SettlementImportRegistry } from './settlement-import.registry';
import { ReconBreakService } from './recon-break.service';

export type ImportSettlementBatchInput = {
  countryId: string;
  countryIso2: string;
  providerCode: string;
  externalBatchRef: string;
  idempotencyKey: string;
  currency: string;
  records?: SettlementImportRecordInput[];
  fetchFromProvider?: boolean;
  importSource?: SettlementImportSource;
  workerRunId?: string;
};

@Injectable()
export class SettlementImportService {
  private readonly logger = new Logger(SettlementImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SettlementImportRegistry,
    private readonly finance: FinanceService,
    private readonly outbox: OutboxService,
    private readonly reconBreaks: ReconBreakService,
  ) {}

  async importBatch(principal: Principal, input: ImportSettlementBatchInput) {
    const environment = readSettlementEnvironment();
    assertSettlementProviderRegistered(
      input.providerCode,
      environment,
      this.registry.isRegistered(input.providerCode),
      'settlement import',
    );
    await this.finance.ensureChart(input.countryId);

    const existing = await this.prisma.settlementImportBatch.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { records: true },
    });
    if (existing) {
      return this.presentBatch(existing, true);
    }

    const dupBatch = await this.prisma.settlementImportBatch.findUnique({
      where: {
        providerCode_environment_externalBatchRef: {
          providerCode: input.providerCode,
          environment,
          externalBatchRef: input.externalBatchRef,
        },
      },
      include: { records: true },
    });
    if (dupBatch) {
      return this.presentBatch(dupBatch, true);
    }

    let payload: SettlementImportBatchPayload;
    if (input.fetchFromProvider !== false && (!input.records || input.records.length === 0)) {
      try {
        const adapter = this.registry.resolve(input.providerCode, environment);
        payload = await adapter.fetchBatch({
          countryId: input.countryId,
          countryIso2: input.countryIso2,
          externalBatchRef: input.externalBatchRef,
          currency: input.currency,
        });
      } catch (err) {
        const transient = Boolean((err as { transient?: boolean }).transient);
        if (transient) {
          throw Errors.problem(
            503,
            'SETTLEMENT_IMPORT_TRANSIENT',
            'Transient settlement import failure',
            'Retry the import; no financial records were staged.',
          );
        }
        const permanent = Boolean((err as { permanent?: boolean }).permanent);
        if (permanent) {
          throw Errors.problem(
            422,
            'SETTLEMENT_IMPORT_PERMANENT',
            'Permanent settlement import failure',
            err instanceof Error ? err.message : 'Provider rejected settlement fetch.',
          );
        }
        throw err;
      }
    } else {
      payload = {
        externalBatchRef: input.externalBatchRef,
        currency: input.currency,
        records: input.records ?? [],
      };
    }

    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.settlementImportBatch.create({
        data: {
          id: uuidv7(),
          countryId: input.countryId,
          providerCode: input.providerCode,
          environment,
          externalBatchRef: payload.externalBatchRef,
          idempotencyKey: input.idempotencyKey,
          status: SettlementImportBatchStatus.RECEIVED,
          importSource: input.importSource ?? SettlementImportSource.MANUAL,
          currency: payload.currency,
          recordCount: payload.records.length,
          sandbox: environment === 'sandbox',
          createdBy: principal.personId,
          workerRunId: input.workerRunId,
        },
      });
      for (const record of payload.records) {
        const prior = await tx.settlementImportRecord.findFirst({
          where: {
            providerCode: input.providerCode,
            environment,
            externalRecordRef: record.externalRecordRef,
          },
        });
        if (prior) {
          if (input.importSource === SettlementImportSource.SCHEDULED) {
            continue;
          }
          throw Errors.problem(
            409,
            'SETTLEMENT_RECORD_DUPLICATE',
            'Duplicate settlement record',
            `Provider record "${record.externalRecordRef}" was already imported.`,
          );
        }
        try {
          await tx.settlementImportRecord.create({
            data: {
              id: uuidv7(),
              batchId: created.id,
              countryId: input.countryId,
              providerCode: input.providerCode,
              environment,
              externalRecordRef: record.externalRecordRef,
              providerPaymentRef: record.providerPaymentRef,
              amountMinor: record.amountMinor,
              feeMinor: record.feeMinor ?? 0n,
              currency: record.currency,
              status: SettlementImportRecordStatus.STAGED,
            },
          });
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError
            && err.code === 'P2002'
          ) {
            if (input.importSource === SettlementImportSource.SCHEDULED) {
              continue;
            }
            throw Errors.problem(
              409,
              'SETTLEMENT_RECORD_DUPLICATE',
              'Duplicate settlement record',
              `Provider record "${record.externalRecordRef}" was already imported.`,
            );
          }
          throw err;
        }
      }
      await this.outbox.enqueue(tx, {
        type: 'SETTLEMENT_IMPORT_RECEIVED',
        aggregateType: 'SettlementImportBatch',
        aggregateId: created.id,
        producer: 'finance',
        countryId: input.countryId,
        payload: {
          sandbox: environment === 'sandbox',
          provider_code: input.providerCode,
          external_batch_ref: payload.externalBatchRef,
        },
        occurrenceKey: `settlement-import:${created.id}:received`,
      });
      return created;
    });

    const normalized = await this.normalizeBatch(batch.id);
    return this.presentBatch(normalized, false);
  }

  async normalizeBatch(batchId: string) {
    const batch = await this.prisma.settlementImportBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { records: true },
    });
    let invalidCount = 0;
    for (const record of batch.records) {
      const invalidReason = this.validateRecord(record);
      if (invalidReason) {
        invalidCount += 1;
        await this.prisma.settlementImportRecord.update({
          where: { id: record.id },
          data: {
            status: SettlementImportRecordStatus.INVALID,
            classification: SettlementMatchClassification.INVALID,
            errorDetail: invalidReason,
            processedAt: new Date(),
          },
        });
        await this.createFinanceRecon(
          record,
          FinanceReconStatus.BREAK,
          'invalid_normalization',
          record.id,
          SettlementMatchClassification.INVALID,
        );
      }
    }
    const status =
      invalidCount === batch.records.length && batch.records.length > 0
        ? SettlementImportBatchStatus.FAILED
        : SettlementImportBatchStatus.NORMALIZED;
    return this.prisma.settlementImportBatch.update({
      where: { id: batchId },
      data: {
        status,
        errorDetail: invalidCount > 0 ? `${invalidCount} invalid record(s) during normalization` : null,
      },
      include: { records: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async matchBatch(batchId: string) {
    assertSettlementImportAllowed('settlement match');
    const batch = await this.prisma.settlementImportBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { records: { orderBy: { createdAt: 'asc' } } },
    });
    if (
      batch.status !== SettlementImportBatchStatus.NORMALIZED
      && batch.status !== SettlementImportBatchStatus.PARTIAL
      && batch.status !== SettlementImportBatchStatus.MATCHING
      && batch.status !== SettlementImportBatchStatus.COMPLETED
    ) {
      throw Errors.problem(
        409,
        'SETTLEMENT_BATCH_NOT_READY',
        'Settlement batch not ready',
        `Batch status ${batch.status} cannot be matched.`,
      );
    }

    await this.prisma.settlementImportBatch.update({
      where: { id: batchId },
      data: { status: SettlementImportBatchStatus.MATCHING },
    });

    let matched = 0;
    let posted = 0;
    for (const record of batch.records) {
      if (
        record.status === SettlementImportRecordStatus.POSTED
        || record.status === SettlementImportRecordStatus.INVALID
        || record.status === SettlementImportRecordStatus.DUPLICATE
      ) {
        if (record.classification === SettlementMatchClassification.MATCH) {
          matched += 1;
        }
        continue;
      }
      const outcome = await this.matchRecord(record.id);
      if (outcome.classification === SettlementMatchClassification.MATCH) {
        matched += 1;
      }
      if (outcome.posted) {
        posted += 1;
      }
    }

    const refreshed = await this.prisma.settlementImportRecord.findMany({ where: { batchId } });
    const terminalStatuses: SettlementImportRecordStatus[] = [
      SettlementImportRecordStatus.POSTED,
      SettlementImportRecordStatus.UNMATCHED,
      SettlementImportRecordStatus.PARTIAL,
      SettlementImportRecordStatus.DUPLICATE,
      SettlementImportRecordStatus.INVALID,
      SettlementImportRecordStatus.FAILED,
    ];
    const allTerminal = refreshed.every((row) => terminalStatuses.includes(row.status));
    const anyMatch = refreshed.some((row) => row.classification === SettlementMatchClassification.MATCH);
    const anyOpen = refreshed.some(
      (row) =>
        row.classification === SettlementMatchClassification.UNMATCHED
        || row.classification === SettlementMatchClassification.PARTIAL,
    );
    const batchStatus = !allTerminal
      ? SettlementImportBatchStatus.MATCHING
      : anyOpen && anyMatch
        ? SettlementImportBatchStatus.PARTIAL
        : anyMatch
          ? SettlementImportBatchStatus.COMPLETED
          : SettlementImportBatchStatus.FAILED;

    const updated = await this.prisma.settlementImportBatch.update({
      where: { id: batchId },
      data: {
        status: batchStatus,
        matchedCount: matched,
        processedAt: new Date(),
        transientFailure: false,
      },
      include: { records: { orderBy: { createdAt: 'asc' } } },
    });
    return this.presentBatch(updated, false);
  }

  async retryBatch(batchId: string) {
    const batch = await this.prisma.settlementImportBatch.findUniqueOrThrow({ where: { id: batchId } });
    if (!batch.transientFailure) {
      throw Errors.problem(
        409,
        'SETTLEMENT_RETRY_NOT_ALLOWED',
        'Settlement retry not allowed',
        'Only batches marked transient_failure can be retried.',
      );
    }
    await this.prisma.settlementImportBatch.update({
      where: { id: batchId },
      data: { transientFailure: false, status: SettlementImportBatchStatus.NORMALIZED },
    });
    return this.matchBatch(batchId);
  }

  async getBatch(batchId: string) {
    const batch = await this.prisma.settlementImportBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: { records: { orderBy: { createdAt: 'asc' } } },
    });
    return this.presentBatch(batch, false);
  }

  async listBatches(query: { countryId?: string; status?: SettlementImportBatchStatus; limit?: number } = {}) {
    const take = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const rows = await this.prisma.settlementImportBatch.findMany({
      where: { countryId: query.countryId, status: query.status },
      orderBy: { createdAt: 'desc' },
      take,
      include: { records: { orderBy: { createdAt: 'asc' } } },
    });
    return {
      data: rows.map((row) => this.presentBatch(row, false)),
      sandbox: true,
      live_psp: false,
    };
  }

  /** Worker/event hook — match a received batch idempotently. */
  async processImportReceived(batchId: string): Promise<void> {
    const batch = await this.prisma.settlementImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) {
      return;
    }
    if (batch.status === SettlementImportBatchStatus.COMPLETED) {
      return;
    }
    if (batch.status === SettlementImportBatchStatus.RECEIVED) {
      await this.normalizeBatch(batchId);
    }
    if (
      batch.status === SettlementImportBatchStatus.NORMALIZED
      || batch.status === SettlementImportBatchStatus.RECEIVED
    ) {
      try {
        await this.matchBatch(batchId);
      } catch (err) {
        this.logger.warn(
          JSON.stringify({
            event: 'settlement_import_match_failed',
            batch_id: batchId,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  }

  private async matchRecord(recordId: string): Promise<{ classification: SettlementMatchClassification; posted: boolean }> {
    const record = await this.prisma.settlementImportRecord.findUniqueOrThrow({ where: { id: recordId } });
    if (record.status === SettlementImportRecordStatus.POSTED) {
      return { classification: record.classification ?? SettlementMatchClassification.DUPLICATE, posted: false };
    }

    const priorPosted = await this.prisma.settlementImportRecord.findFirst({
      where: {
        providerCode: record.providerCode,
        environment: record.environment,
        externalRecordRef: record.externalRecordRef,
        status: SettlementImportRecordStatus.POSTED,
        NOT: { id: record.id },
      },
    });
    if (priorPosted) {
      await this.markRecord(record.id, {
        classification: SettlementMatchClassification.DUPLICATE,
        status: SettlementImportRecordStatus.DUPLICATE,
        errorDetail: 'Provider settlement record already posted',
      });
      return { classification: SettlementMatchClassification.DUPLICATE, posted: false };
    }

    if (!record.providerPaymentRef?.trim()) {
      await this.markRecord(record.id, {
        classification: SettlementMatchClassification.UNMATCHED,
        status: SettlementImportRecordStatus.UNMATCHED,
        errorDetail: 'Missing provider payment reference',
      });
      await this.createFinanceRecon(
        record,
        FinanceReconStatus.INVESTIGATE,
        'missing_provider_ref',
        undefined,
        SettlementMatchClassification.UNMATCHED,
      );
      return { classification: SettlementMatchClassification.UNMATCHED, posted: false };
    }

    const attempt = await this.prisma.paymentAttempt.findFirst({
      where: { providerRef: record.providerPaymentRef, submitted: true },
      include: { intent: true },
    });
    if (!attempt?.intent) {
      await this.markRecord(record.id, {
        classification: SettlementMatchClassification.UNMATCHED,
        status: SettlementImportRecordStatus.UNMATCHED,
        errorDetail: 'No internal payment attempt for provider reference',
      });
      await this.createFinanceRecon(
        record,
        FinanceReconStatus.BREAK,
        'unmatched_provider_ref',
        undefined,
        SettlementMatchClassification.UNMATCHED,
      );
      return { classification: SettlementMatchClassification.UNMATCHED, posted: false };
    }

    if (attempt.intent.countryId !== record.countryId) {
      await this.markRecord(record.id, {
        classification: SettlementMatchClassification.INVALID,
        status: SettlementImportRecordStatus.INVALID,
        errorDetail: 'Payment intent country mismatch',
      });
      await this.createFinanceRecon(
        record,
        FinanceReconStatus.BREAK,
        'country_mismatch',
        attempt.intent.id,
        SettlementMatchClassification.INVALID,
      );
      return { classification: SettlementMatchClassification.INVALID, posted: false };
    }

    const expected =
      attempt.intent.capturedMinor > 0n ? attempt.intent.capturedMinor : attempt.intent.amountMinor;
    let classification: SettlementMatchClassification = SettlementMatchClassification.MATCH;
    if (record.amountMinor <= 0n) {
      classification = SettlementMatchClassification.INVALID;
    } else if (record.amountMinor < expected) {
      classification = SettlementMatchClassification.PARTIAL;
    } else if (record.amountMinor > expected) {
      classification = SettlementMatchClassification.PARTIAL;
    }

    if (classification === SettlementMatchClassification.INVALID) {
      await this.markRecord(record.id, {
        classification,
        status: SettlementImportRecordStatus.INVALID,
        errorDetail: 'Invalid settlement amount',
        paymentIntentId: attempt.intent.id,
      });
      await this.createFinanceRecon(
        record,
        FinanceReconStatus.BREAK,
        'invalid_amount',
        attempt.intent.id,
        SettlementMatchClassification.INVALID,
      );
      return { classification, posted: false };
    }

    if (classification === SettlementMatchClassification.PARTIAL) {
      await this.markRecord(record.id, {
        classification,
        status: SettlementImportRecordStatus.PARTIAL,
        errorDetail: `Settlement amount ${record.amountMinor} differs from expected ${expected}`,
        paymentIntentId: attempt.intent.id,
      });
      await this.createFinanceRecon(
        record,
        FinanceReconStatus.BREAK,
        'partial_amount',
        attempt.intent.id,
        SettlementMatchClassification.PARTIAL,
      );
      return { classification, posted: false };
    }

    const journalSourceKey = `psp_settlement:${record.id}`;
    const existingJournal = await this.prisma.journal.findUnique({
      where: {
        sourceEventId_postingRuleId: { sourceEventId: journalSourceKey, postingRuleId: 'psp_settlement_match' },
      },
    });
    if (existingJournal) {
      await this.markRecord(record.id, {
        classification: SettlementMatchClassification.DUPLICATE,
        status: SettlementImportRecordStatus.DUPLICATE,
        errorDetail: 'Settlement journal already posted',
        paymentIntentId: attempt.intent.id,
        journalSourceKey,
      });
      return { classification: SettlementMatchClassification.DUPLICATE, posted: false };
    }

    if (
      attempt.intent.status !== PaymentIntentStatus.CAPTURED
      && attempt.intent.status !== PaymentIntentStatus.AUTHORIZED_COD
    ) {
      await this.markRecord(record.id, {
        classification: SettlementMatchClassification.UNMATCHED,
        status: SettlementImportRecordStatus.UNMATCHED,
        errorDetail: `Payment intent status ${attempt.intent.status} is not settled`,
        paymentIntentId: attempt.intent.id,
      });
      await this.createFinanceRecon(
        record,
        FinanceReconStatus.INVESTIGATE,
        'intent_not_captured',
        attempt.intent.id,
        SettlementMatchClassification.UNMATCHED,
      );
      return { classification: SettlementMatchClassification.UNMATCHED, posted: false };
    }

    await this.finance.syncFinanceForPaymentIntent(attempt.intent.id);
    const { duplicate } = await this.finance.postPspSettlementMatchJournal({
      countryId: record.countryId,
      recordId: record.id,
      amountMinor: record.amountMinor,
      feeMinor: record.feeMinor,
      currency: record.currency,
    });
    if (duplicate) {
      await this.markRecord(record.id, {
        classification: SettlementMatchClassification.DUPLICATE,
        status: SettlementImportRecordStatus.DUPLICATE,
        errorDetail: 'Duplicate settlement journal',
        paymentIntentId: attempt.intent.id,
        journalSourceKey,
      });
      return { classification: SettlementMatchClassification.DUPLICATE, posted: false };
    }

    const financeReconId = await this.createFinanceRecon(
      record,
      FinanceReconStatus.MATCHED,
      'none',
      attempt.intent.id,
    );
    await this.markRecord(record.id, {
      classification: SettlementMatchClassification.MATCH,
      status: SettlementImportRecordStatus.POSTED,
      paymentIntentId: attempt.intent.id,
      journalSourceKey,
      financeReconId,
    });
    return { classification: SettlementMatchClassification.MATCH, posted: true };
  }

  private validateRecord(record: {
    externalRecordRef: string;
    providerPaymentRef: string | null;
    amountMinor: bigint;
    currency: string;
  }): string | null {
    if (!record.externalRecordRef?.trim()) {
      return 'external_record_ref required';
    }
    if (!record.currency || record.currency.length !== 3) {
      return 'currency must be ISO-4217';
    }
    if (record.amountMinor < 0n) {
      return 'amount_minor cannot be negative';
    }
    return null;
  }

  private async markRecord(
    recordId: string,
    data: {
      classification: SettlementMatchClassification;
      status: SettlementImportRecordStatus;
      errorDetail?: string;
      paymentIntentId?: string;
      journalSourceKey?: string;
      financeReconId?: string;
    },
  ) {
    await this.prisma.settlementImportRecord.update({
      where: { id: recordId },
      data: {
        classification: data.classification,
        status: data.status,
        errorDetail: data.errorDetail,
        paymentIntentId: data.paymentIntentId,
        journalSourceKey: data.journalSourceKey,
        financeReconId: data.financeReconId,
        processedAt: new Date(),
      },
    });
  }

  private async createFinanceRecon(
    record: {
      id: string;
      countryId: string;
      amountMinor: bigint;
      currency: string;
      providerPaymentRef: string | null;
    },
    status: FinanceReconStatus,
    breakType: string,
    internalRef?: string,
    classification?: SettlementMatchClassification,
  ): Promise<string> {
    return this.reconBreaks.createBreak({
      domain: FinanceReconDomain.PSP,
      status,
      breakType,
      countryId: record.countryId,
      detail: `settlement import record ${record.id}`,
      classification: classification ?? undefined,
      sourceKind: FinanceReconSourceKind.SETTLEMENT_IMPORT,
      sourceRef: record.id,
      internalRef: internalRef ?? record.id,
      externalRef: record.providerPaymentRef ?? undefined,
      amountMinor: record.amountMinor,
      currency: record.currency,
    });
  }

  private presentBatch(
    batch: {
      id: string;
      countryId: string;
      providerCode: string;
      environment: string;
      externalBatchRef: string;
      idempotencyKey: string;
      status: SettlementImportBatchStatus;
      importSource: SettlementImportSource;
      workerRunId: string | null;
      currency: string;
      recordCount: number;
      matchedCount: number;
      errorDetail: string | null;
      transientFailure: boolean;
      sandbox: boolean;
      createdAt: Date;
      processedAt: Date | null;
      records?: Array<{
        id: string;
        externalRecordRef: string;
        providerPaymentRef: string | null;
        paymentIntentId: string | null;
        amountMinor: bigint;
        feeMinor: bigint;
        currency: string;
        classification: SettlementMatchClassification | null;
        status: SettlementImportRecordStatus;
        errorDetail: string | null;
        journalSourceKey: string | null;
        createdAt: Date;
        processedAt: Date | null;
      }>;
    },
    duplicate: boolean,
  ) {
    return {
      id: batch.id,
      country_id: batch.countryId,
      provider_code: batch.providerCode,
      environment: batch.environment,
      external_batch_ref: batch.externalBatchRef,
      idempotency_key: batch.idempotencyKey,
      status: batch.status,
      import_source: batch.importSource,
      worker_run_id: batch.workerRunId,
      currency: batch.currency,
      record_count: batch.recordCount,
      matched_count: batch.matchedCount,
      error_detail: batch.errorDetail,
      transient_failure: batch.transientFailure,
      sandbox: batch.sandbox,
      live_psp: false,
      duplicate,
      created_at: batch.createdAt.toISOString(),
      processed_at: batch.processedAt?.toISOString() ?? null,
      records: (batch.records ?? []).map((row) => ({
        id: row.id,
        external_record_ref: row.externalRecordRef,
        provider_payment_ref: row.providerPaymentRef,
        payment_intent_id: row.paymentIntentId,
        amount_minor: row.amountMinor.toString(),
        fee_minor: row.feeMinor.toString(),
        currency: row.currency,
        classification: row.classification,
        status: row.status,
        error_detail: row.errorDetail,
        journal_source_key: row.journalSourceKey,
        created_at: row.createdAt.toISOString(),
        processed_at: row.processedAt?.toISOString() ?? null,
      })),
    };
  }
}

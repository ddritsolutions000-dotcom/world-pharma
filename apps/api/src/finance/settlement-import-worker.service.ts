import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  SettlementImportBatchStatus,
  SettlementImportSource,
  SettlementImportWorkerRunStatus,
  Prisma,
} from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { HttpException } from '@nestjs/common';
import { PrismaService } from '../app/prisma.service';
import type { Principal } from '../identity/current-principal';
import { assertCountryAccess, countryFilter, loadAccessScope } from '../identity/scope';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import {
  assertSettlementImportWorkerAllowed,
  isSettlementImportWorkerEnabled,
  readSettlementImportWorkerMaxRetries,
  readSettlementImportWorkerPollMs,
  workerImportIdempotencyKey,
  workerRetryBackoffMs,
} from './settlement-import-worker.config';
import {
  assertSettlementProviderRegistered,
  readSettlementEnvironment,
} from './settlement-import.config';
import { SettlementImportRegistry } from './settlement-import.registry';
import { SettlementImportService } from './settlement-import.service';

const WORKER_PRINCIPAL: Principal = {
  personId: '00000000-0000-4000-8000-000000000001',
  sessionId: 'settlement-import-worker',
  audience: 'admin',
  roles: [],
  tokenVersion: 0,
};

export type WorkerRunOutcome = {
  runId: string;
  status: SettlementImportWorkerRunStatus;
  batchId?: string;
  duplicate?: boolean;
  skipped?: boolean;
};

@Injectable()
export class SettlementImportWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SettlementImportWorkerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SettlementImportRegistry,
    private readonly imports: SettlementImportService,
  ) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test') {
      return;
    }
    if (!isSettlementImportWorkerEnabled()) {
      return;
    }
    const pollMs = readSettlementImportWorkerPollMs();
    this.timer = setInterval(() => {
      void this.pollOnce().catch((error) => {
        this.logger.warn(
          JSON.stringify({
            event: 'settlement_import_worker_poll_failed',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    }, pollMs);
    this.logger.log(JSON.stringify({ event: 'settlement_import_worker_started', poll_ms: pollMs }));
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One poll cycle — schedules + due retries. Exposed for e2e. */
  async pollOnce(): Promise<WorkerRunOutcome[]> {
    assertSettlementImportWorkerAllowed('settlement import worker poll');
    const outcomes: WorkerRunOutcome[] = [];
    const schedules = await this.prisma.settlementImportSchedule.findMany({
      where: { enabled: true },
      include: { country: true },
    });
    for (const schedule of schedules) {
      const scheduleOutcomes = await this.prisma.runWithTenant(
        workerTenantContext({ countryId: schedule.countryId }),
        () => this.processSchedule(schedule),
      );
      outcomes.push(...scheduleOutcomes);
    }
    const retries = await this.prisma.settlementImportWorkerRun.findMany({
      where: {
        status: SettlementImportWorkerRunStatus.FAILED_TRANSIENT,
        nextRetryAt: { lte: new Date() },
      },
      take: 50,
    });
    for (const run of retries) {
      if (run.retryCount >= run.maxRetries) {
        await this.prisma.settlementImportWorkerRun.update({
          where: { id: run.id },
          data: {
            status: SettlementImportWorkerRunStatus.FAILED_PERMANENT,
            failureClassification: 'PERMANENT',
            lastErrorCode: 'MAX_RETRIES_EXCEEDED',
            errorDetail: 'Transient settlement import retries exhausted.',
            completedAt: new Date(),
          },
        });
        continue;
      }
      const country = await this.prisma.country.findUniqueOrThrow({ where: { id: run.countryId } });
      const schedule = await this.prisma.settlementImportSchedule.findFirst({
        where: { countryId: run.countryId, providerCode: run.providerCode },
      });
      const outcome = await this.prisma.runWithTenant(
        workerTenantContext({ countryId: run.countryId }),
        async () => {
          const claim = await this.claimWorkerRun({
            scheduleId: run.scheduleId ?? schedule?.id,
            countryId: run.countryId,
            providerCode: run.providerCode,
            externalBatchRef: run.externalBatchRef,
            existingRunId: run.id,
            isRetry: true,
          });
          if (claim.skipped) {
            return claim;
          }
          return this.executeImportPhase({
            runId: claim.runId,
            scheduleId: run.scheduleId ?? schedule?.id,
            countryId: run.countryId,
            countryIso2: country.isoAlpha2,
            providerCode: run.providerCode,
            currency: schedule?.currency ?? country.defaultCurrency,
            externalBatchRef: run.externalBatchRef,
            isRetry: true,
          });
        },
      );
      outcomes.push(outcome);
    }
    return outcomes;
  }

  /** Import one batch ref for a schedule — exposed for e2e. */
  async runScheduledImport(input: {
    scheduleId: string;
    externalBatchRef: string;
  }): Promise<WorkerRunOutcome> {
    const schedule = await this.prisma.settlementImportSchedule.findUniqueOrThrow({
      where: { id: input.scheduleId },
      include: { country: true },
    });
    assertSettlementImportWorkerAllowed('settlement import worker run');
    const claim = await this.claimWorkerRun({
      scheduleId: schedule.id,
      countryId: schedule.countryId,
      providerCode: schedule.providerCode,
      externalBatchRef: input.externalBatchRef,
    });
    if (claim.skipped) {
      return claim;
    }
    return this.prisma.runWithTenant(workerTenantContext({ countryId: schedule.countryId }), () =>
      this.executeImportPhase({
        runId: claim.runId,
        scheduleId: schedule.id,
        countryId: schedule.countryId,
        countryIso2: schedule.country.isoAlpha2,
        providerCode: schedule.providerCode,
        currency: schedule.currency,
        externalBatchRef: input.externalBatchRef,
      }),
    );
  }

  async listWorkerRuns(
    principal: Principal,
    query: { countryId?: string; status?: SettlementImportWorkerRunStatus; limit?: number } = {},
  ) {
    const scope = await loadAccessScope(this.prisma, principal);
    const scopedCountry = countryFilter(scope);
    if (query.countryId) {
      assertCountryAccess(scope, query.countryId);
    }
    const take = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const rows = await this.prisma.settlementImportWorkerRun.findMany({
      where: {
        countryId: query.countryId ?? scopedCountry,
        status: query.status,
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        batches: {
          select: {
            id: true,
            status: true,
            recordCount: true,
            matchedCount: true,
            importSource: true,
          },
          take: 1,
        },
      },
    });
    return {
      data: rows.map((row) => this.presentRun(row)),
      sandbox: true,
      live_psp: false,
    };
  }

  private async processSchedule(schedule: {
    id: string;
    countryId: string;
    providerCode: string;
    currency: string;
    country: { isoAlpha2: string };
  }): Promise<WorkerRunOutcome[]> {
    const environment = readSettlementEnvironment();
    try {
      assertSettlementProviderRegistered(
        schedule.providerCode,
        environment,
        this.registry.isRegistered(schedule.providerCode),
        'settlement import worker',
      );
    } catch (err) {
      this.logger.warn(
        JSON.stringify({
          event: 'settlement_import_worker_schedule_skipped',
          schedule_id: schedule.id,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return [];
    }
    const adapter = this.registry.resolve(schedule.providerCode, environment);
    const refs = await adapter.listAvailableBatches({
      countryId: schedule.countryId,
      countryIso2: schedule.country.isoAlpha2,
      currency: schedule.currency,
    });
    const outcomes: WorkerRunOutcome[] = [];
    for (const externalBatchRef of refs) {
      const claim = await this.claimWorkerRun({
        scheduleId: schedule.id,
        countryId: schedule.countryId,
        providerCode: schedule.providerCode,
        externalBatchRef,
      });
      if (claim.skipped) {
        outcomes.push(claim);
        continue;
      }
      outcomes.push(
        await this.prisma.runWithTenant(workerTenantContext({ countryId: schedule.countryId }), () =>
          this.executeImportPhase({
            runId: claim.runId,
            scheduleId: schedule.id,
            countryId: schedule.countryId,
            countryIso2: schedule.country.isoAlpha2,
            providerCode: schedule.providerCode,
            currency: schedule.currency,
            externalBatchRef,
          }),
        ),
      );
    }
    return outcomes;
  }

  private async claimWorkerRun(input: {
    scheduleId?: string;
    countryId: string;
    providerCode: string;
    externalBatchRef: string;
    existingRunId?: string;
    isRetry?: boolean;
  }): Promise<WorkerRunOutcome> {
    const environment = readSettlementEnvironment();
    const idempotencyKey = workerImportIdempotencyKey(
      input.providerCode,
      input.countryId,
      input.externalBatchRef,
    );
    const maxRetries = readSettlementImportWorkerMaxRetries();
    let run = input.existingRunId
      ? await this.prisma.settlementImportWorkerRun.findUniqueOrThrow({ where: { id: input.existingRunId } })
      : await this.prisma.settlementImportWorkerRun.findUnique({ where: { idempotencyKey } });

    if (run?.status === SettlementImportWorkerRunStatus.SUCCEEDED) {
      const batch = await this.prisma.settlementImportBatch.findFirst({ where: { workerRunId: run.id } });
      return {
        runId: run.id,
        status: run.status,
        batchId: batch?.id,
        duplicate: true,
        skipped: true,
      };
    }
    if (run?.status === SettlementImportWorkerRunStatus.FAILED_PERMANENT) {
      return { runId: run.id, status: run.status, skipped: true };
    }
    if (run?.status === SettlementImportWorkerRunStatus.FAILED_TRANSIENT && !input.isRetry && !input.existingRunId) {
      return { runId: run.id, status: run.status, skipped: true };
    }
    if (run?.status === SettlementImportWorkerRunStatus.RUNNING && !input.isRetry && !input.existingRunId) {
      return { runId: run.id, status: run.status, skipped: true };
    }

    const now = new Date();
    if (!run) {
      try {
        run = await this.prisma.settlementImportWorkerRun.create({
          data: {
            id: uuidv7(),
            scheduleId: input.scheduleId,
            countryId: input.countryId,
            providerCode: input.providerCode,
            environment,
            externalBatchRef: input.externalBatchRef,
            idempotencyKey,
            status: SettlementImportWorkerRunStatus.RUNNING,
            maxRetries,
            startedAt: now,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError
          && err.code === 'P2002'
        ) {
          run = await this.prisma.settlementImportWorkerRun.findUniqueOrThrow({ where: { idempotencyKey } });
          if (run.status === SettlementImportWorkerRunStatus.RUNNING) {
            return { runId: run.id, status: run.status, skipped: true };
          }
        } else {
          throw err;
        }
      }
    } else {
      run = await this.prisma.settlementImportWorkerRun.update({
        where: { id: run.id },
        data: {
          status: SettlementImportWorkerRunStatus.RUNNING,
          retryCount: input.isRetry ? { increment: 1 } : run.retryCount,
          startedAt: now,
          nextRetryAt: null,
          scheduleId: input.scheduleId ?? run.scheduleId,
        },
      });
    }
    return { runId: run.id, status: run.status };
  }

  private async executeImportPhase(input: {
    runId: string;
    scheduleId?: string;
    countryId: string;
    countryIso2: string;
    providerCode: string;
    currency: string;
    externalBatchRef: string;
    isRetry?: boolean;
  }): Promise<WorkerRunOutcome> {
    const idempotencyKey = workerImportIdempotencyKey(
      input.providerCode,
      input.countryId,
      input.externalBatchRef,
    );
    const run = await this.prisma.settlementImportWorkerRun.findUniqueOrThrow({ where: { id: input.runId } });
    try {
      const batch = await this.imports.importBatch(WORKER_PRINCIPAL, {
        countryId: input.countryId,
        countryIso2: input.countryIso2,
        providerCode: input.providerCode,
        externalBatchRef: input.externalBatchRef,
        idempotencyKey,
        currency: input.currency,
        fetchFromProvider: true,
        importSource: SettlementImportSource.SCHEDULED,
        workerRunId: run.id,
      });
      await this.imports.processImportReceived(batch.id);
      const completed = await this.prisma.settlementImportWorkerRun.update({
        where: { id: run.id },
        data: {
          status: SettlementImportWorkerRunStatus.SUCCEEDED,
          completedAt: new Date(),
          failureClassification: null,
          lastErrorCode: null,
          errorDetail: null,
        },
      });
      return {
        runId: completed.id,
        status: completed.status,
        batchId: batch.id,
        duplicate: batch.duplicate,
      };
    } catch (err) {
      const classification = classifyWorkerFailure(err);
      if (classification.kind === 'TRANSIENT' && run.retryCount < run.maxRetries) {
        const nextRetryAt = new Date(Date.now() + workerRetryBackoffMs(run.retryCount + 1));
        const failed = await this.prisma.settlementImportWorkerRun.update({
          where: { id: run.id },
          data: {
            status: SettlementImportWorkerRunStatus.FAILED_TRANSIENT,
            failureClassification: 'TRANSIENT',
            lastErrorCode: classification.code,
            errorDetail: classification.detail,
            nextRetryAt,
            completedAt: new Date(),
          },
        });
        return { runId: failed.id, status: failed.status };
      }
      const failed = await this.prisma.settlementImportWorkerRun.update({
        where: { id: run.id },
        data: {
          status: SettlementImportWorkerRunStatus.FAILED_PERMANENT,
          failureClassification: classification.kind,
          lastErrorCode: classification.code,
          errorDetail: classification.detail,
          completedAt: new Date(),
          nextRetryAt: null,
        },
      });
      return { runId: failed.id, status: failed.status };
    }
  }

  private presentRun(row: {
    id: string;
    scheduleId: string | null;
    countryId: string;
    providerCode: string;
    environment: string;
    externalBatchRef: string;
    status: SettlementImportWorkerRunStatus;
    retryCount: number;
    maxRetries: number;
    failureClassification: string | null;
    lastErrorCode: string | null;
    errorDetail: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    nextRetryAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    batches: Array<{
      id: string;
      status: SettlementImportBatchStatus;
      recordCount: number;
      matchedCount: number;
      importSource: SettlementImportSource;
    }>;
  }) {
    const batch = row.batches[0];
    return {
      id: row.id,
      schedule_id: row.scheduleId,
      country_id: row.countryId,
      provider_code: row.providerCode,
      environment: row.environment,
      external_batch_ref: row.externalBatchRef,
      status: row.status,
      import_source: SettlementImportSource.SCHEDULED,
      retry_count: row.retryCount,
      max_retries: row.maxRetries,
      failure_classification: row.failureClassification,
      last_error_code: row.lastErrorCode,
      error_detail: row.errorDetail,
      batch_id: batch?.id ?? null,
      batch_status: batch?.status ?? null,
      record_count: batch?.recordCount ?? null,
      matched_count: batch?.matchedCount ?? null,
      started_at: row.startedAt?.toISOString() ?? null,
      completed_at: row.completedAt?.toISOString() ?? null,
      next_retry_at: row.nextRetryAt?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      sandbox: true,
      live_psp: false,
    };
  }
}

function classifyWorkerFailure(err: unknown): { kind: string; code: string; detail: string } {
  if (err instanceof HttpException) {
    const body = err.getResponse() as { code?: string; detail?: string; status?: number };
    if (
      body.code === 'SETTLEMENT_PROVIDER_NOT_CONFIGURED'
      || body.code === 'MOCK_SETTLEMENT_PRODUCTION_FORBIDDEN'
      || body.code === 'LIVE_SETTLEMENT_IMPORT_DISABLED'
      || body.code === 'SETTLEMENT_IMPORT_PERMANENT'
    ) {
      return { kind: 'PERMANENT', code: body.code ?? 'SETTLEMENT_IMPORT_PERMANENT', detail: body.detail ?? 'Permanent failure' };
    }
    if (body.code === 'SETTLEMENT_IMPORT_TRANSIENT') {
      return { kind: 'TRANSIENT', code: body.code, detail: body.detail ?? 'Transient failure' };
    }
    if (body.status === 503) {
      return { kind: 'TRANSIENT', code: body.code ?? 'SETTLEMENT_IMPORT_TRANSIENT', detail: body.detail ?? 'Transient failure' };
    }
    return { kind: 'PERMANENT', code: body.code ?? 'SETTLEMENT_IMPORT_FAILED', detail: body.detail ?? 'Import failed' };
  }
  if (Boolean((err as { transient?: boolean }).transient)) {
    return { kind: 'TRANSIENT', code: 'SETTLEMENT_IMPORT_TRANSIENT', detail: 'Transient provider fetch failure' };
  }
  if (Boolean((err as { permanent?: boolean }).permanent)) {
    return {
      kind: 'PERMANENT',
      code: String((err as { code?: string }).code ?? 'SETTLEMENT_IMPORT_PERMANENT'),
      detail: err instanceof Error ? err.message : 'Permanent provider fetch failure',
    };
  }
  return {
    kind: 'UNKNOWN',
    code: 'SETTLEMENT_IMPORT_UNKNOWN',
    detail: err instanceof Error ? err.message : 'Unknown settlement import failure',
  };
}

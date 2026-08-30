import { Injectable } from '@nestjs/common';
import { Prisma, SettlementImportWorkerRunStatus } from '@prisma/client';
import { uuidv7 } from '@world-pharma/shared';
import { PrismaService } from '../app/prisma.service';
import { Errors } from '../common/problem';
import { OutboxService } from '../events/outbox.service';
import type { Principal } from '../identity/current-principal';
import { assertCountryAccess, countryFilter, loadAccessScope } from '../identity/scope';
import {
  assertSettlementImportAllowed,
  assertSettlementProviderRegistered,
  readSettlementEnvironment,
} from './settlement-import.config';
import { SettlementImportRegistry } from './settlement-import.registry';
import {
  isSettlementImportWorkerEnabled,
  readSettlementImportWorkerPollMs,
} from './settlement-import-worker.config';

export type CreateSettlementImportScheduleInput = {
  countryId: string;
  providerCode: string;
  currency: string;
  enabled?: boolean;
};

export type UpdateSettlementImportScheduleInput = {
  currency?: string;
  enabled?: boolean;
};

@Injectable()
export class SettlementImportScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SettlementImportRegistry,
    private readonly outbox: OutboxService,
  ) {}

  async listSchedules(
    principal: Principal,
    query: { countryId?: string; enabled?: boolean; limit?: number } = {},
  ) {
    const scope = await loadAccessScope(this.prisma, principal);
    const scopedCountry = countryFilter(scope);
    if (query.countryId) {
      assertCountryAccess(scope, query.countryId);
    }
    const take = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const rows = await this.prisma.settlementImportSchedule.findMany({
      where: {
        countryId: query.countryId ?? scopedCountry,
        enabled: query.enabled,
      },
      orderBy: { updatedAt: 'desc' },
      take,
      include: {
        country: { select: { isoAlpha2: true, nameI18n: true } },
        workerRuns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            status: true,
            completedAt: true,
            startedAt: true,
            failureClassification: true,
            lastErrorCode: true,
          },
        },
      },
    });
    return {
      data: rows.map((row) => this.presentSchedule(row)),
      worker_enabled: isSettlementImportWorkerEnabled(),
      worker_poll_ms: readSettlementImportWorkerPollMs(),
      sandbox: true,
      live_psp: false,
    };
  }

  async getSchedule(principal: Principal, scheduleId: string) {
    const scope = await loadAccessScope(this.prisma, principal);
    const row = await this.prisma.settlementImportSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        country: { select: { isoAlpha2: true, nameI18n: true } },
        workerRuns: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            externalBatchRef: true,
            completedAt: true,
            startedAt: true,
            failureClassification: true,
            lastErrorCode: true,
            retryCount: true,
          },
        },
      },
    });
    if (!row) {
      if (countryFilter(scope)) {
        throw Errors.forbidden('This country is outside the current membership scope.');
      }
      throw Errors.notFound('Settlement import schedule not found.');
    }
    assertCountryAccess(scope, row.countryId);
    return this.presentSchedule(row, { includeRecentRuns: true });
  }

  async createSchedule(principal: Principal, input: CreateSettlementImportScheduleInput) {
    const scope = await loadAccessScope(this.prisma, principal);
    assertCountryAccess(scope, input.countryId);
    this.validateScheduleFields(input.providerCode, input.currency);
    const environment = readSettlementEnvironment();
    assertSettlementImportAllowed('settlement import schedule create');
    assertSettlementProviderRegistered(
      input.providerCode,
      environment,
      this.registry.isRegistered(input.providerCode),
      'settlement import schedule create',
    );
    const country = await this.prisma.country.findUnique({ where: { id: input.countryId } });
    if (!country) {
      throw Errors.notFound('Country not found.');
    }
    const currency = input.currency.trim().toUpperCase();
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.settlementImportSchedule.create({
          data: {
            id: uuidv7(),
            countryId: input.countryId,
            providerCode: input.providerCode.trim(),
            currency,
            enabled: input.enabled ?? true,
          },
          include: {
            country: { select: { isoAlpha2: true, nameI18n: true } },
            workerRuns: { take: 0 },
          },
        });
        await this.outbox.enqueue(tx, {
          type: 'FINANCE_SETTLEMENT_SCHEDULE_CREATED',
          aggregateType: 'SettlementImportSchedule',
          aggregateId: created.id,
          producer: 'finance',
          payload: {
            country_id: created.countryId,
            provider_code: created.providerCode,
            currency: created.currency,
            enabled: created.enabled,
            actor_person_id: principal.personId,
            sandbox: true,
          },
          occurrenceKey: `finance_settlement_schedule:created:${created.id}`,
        });
        return created;
      });
      return this.presentSchedule(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError
        && err.code === 'P2002'
      ) {
        throw Errors.problem(
          409,
          'SETTLEMENT_SCHEDULE_DUPLICATE',
          'Duplicate settlement import schedule',
          `A schedule already exists for provider "${input.providerCode}" in this country.`,
        );
      }
      throw err;
    }
  }

  async updateSchedule(
    principal: Principal,
    scheduleId: string,
    input: UpdateSettlementImportScheduleInput,
  ) {
    const scope = await loadAccessScope(this.prisma, principal);
    const existing = await this.prisma.settlementImportSchedule.findUnique({ where: { id: scheduleId } });
    if (!existing) {
      if (countryFilter(scope)) {
        throw Errors.forbidden('This country is outside the current membership scope.');
      }
      throw Errors.notFound('Settlement import schedule not found.');
    }
    assertCountryAccess(scope, existing.countryId);
    if (input.currency !== undefined) {
      this.validateScheduleFields(existing.providerCode, input.currency);
    }
    const data: Prisma.SettlementImportScheduleUpdateInput = {};
    if (input.currency !== undefined) {
      data.currency = input.currency.trim().toUpperCase();
    }
    if (input.enabled !== undefined) {
      data.enabled = input.enabled;
    }
    if (Object.keys(data).length === 0) {
      return this.getSchedule(principal, scheduleId);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.settlementImportSchedule.update({
        where: { id: scheduleId },
        data,
        include: {
          country: { select: { isoAlpha2: true, nameI18n: true } },
          workerRuns: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              status: true,
              completedAt: true,
              startedAt: true,
              failureClassification: true,
              lastErrorCode: true,
            },
          },
        },
      });
      const eventType =
        input.enabled === true
          ? 'FINANCE_SETTLEMENT_SCHEDULE_ENABLED'
          : input.enabled === false
            ? 'FINANCE_SETTLEMENT_SCHEDULE_DISABLED'
            : 'FINANCE_SETTLEMENT_SCHEDULE_UPDATED';
      await this.outbox.enqueue(tx, {
        type: eventType,
        aggregateType: 'SettlementImportSchedule',
        aggregateId: updated.id,
        producer: 'finance',
        payload: {
          country_id: updated.countryId,
          provider_code: updated.providerCode,
          currency: updated.currency,
          enabled: updated.enabled,
          actor_person_id: principal.personId,
          sandbox: true,
        },
        occurrenceKey: `finance_settlement_schedule:${eventType.toLowerCase()}:${updated.id}:${updated.updatedAt.toISOString()}`,
      });
      return updated;
    });
    return this.presentSchedule(row);
  }

  private validateScheduleFields(providerCode: string, currency: string): void {
    if (!providerCode?.trim()) {
      throw Errors.validation('provider_code is required');
    }
    const normalizedCurrency = currency?.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      throw Errors.validation('currency must be a 3-letter ISO code');
    }
  }

  private presentSchedule(
    row: {
      id: string;
      countryId: string;
      providerCode: string;
      currency: string;
      enabled: boolean;
      createdAt: Date;
      updatedAt: Date;
      country?: { isoAlpha2: string; nameI18n: unknown };
      workerRuns?: Array<{
        id: string;
        status: SettlementImportWorkerRunStatus;
        externalBatchRef?: string;
        completedAt: Date | null;
        startedAt: Date | null;
        failureClassification: string | null;
        lastErrorCode: string | null;
        retryCount?: number;
      }>;
    },
    options: { includeRecentRuns?: boolean } = {},
  ) {
    const lastRun = row.workerRuns?.[0];
    return {
      id: row.id,
      country_id: row.countryId,
      country_iso2: row.country?.isoAlpha2 ?? null,
      provider_code: row.providerCode,
      currency: row.currency,
      enabled: row.enabled,
      worker_poll_ms: readSettlementImportWorkerPollMs(),
      last_run: lastRun
        ? {
            id: lastRun.id,
            status: lastRun.status,
            external_batch_ref: lastRun.externalBatchRef ?? null,
            started_at: lastRun.startedAt?.toISOString() ?? null,
            completed_at: lastRun.completedAt?.toISOString() ?? null,
            failure_classification: lastRun.failureClassification,
            last_error_code: lastRun.lastErrorCode,
            retry_count: lastRun.retryCount ?? null,
          }
        : null,
      recent_runs: options.includeRecentRuns
        ? (row.workerRuns ?? []).map((run) => ({
            id: run.id,
            status: run.status,
            external_batch_ref: run.externalBatchRef ?? null,
            started_at: run.startedAt?.toISOString() ?? null,
            completed_at: run.completedAt?.toISOString() ?? null,
            failure_classification: run.failureClassification,
            last_error_code: run.lastErrorCode,
            retry_count: run.retryCount ?? null,
          }))
        : undefined,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      sandbox: true,
      live_psp: false,
    };
  }
}

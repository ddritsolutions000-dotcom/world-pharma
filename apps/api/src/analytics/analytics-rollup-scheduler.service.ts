import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../app/prisma.service';
import type { EventEnvelope } from '../events/envelope';
import { EventHandlerRegistry } from '../events/handlers';
import { OutboxService } from '../events/outbox.service';
import { EventWorkerService } from '../events/worker.service';
import { utcDayStart } from './analytics-query';
import { AnalyticsWorkerService } from './analytics-worker.service';
import {
  ANALYTICS_DAILY_ROLLUP_EVENT,
  ANALYTICS_PURGE_AGGREGATE_ID,
  ANALYTICS_ROLLUP_AGGREGATE_ID,
  CRM_PERSONALIZATION_PURGE_EVENT,
  isAnalyticsRollupSchedulerEnabled,
  purgeOccurrenceKey,
  readAnalyticsRollupSchedulerPollMs,
  rollupOccurrenceKey,
} from './analytics-rollup-scheduler.config';

export type AnalyticsRollupTickOutcome = {
  status: 'completed' | 'skipped' | 'failed';
  metric_date: string;
  countries_processed?: number;
  reason?: string;
  error?: string | null;
  event_id?: string;
};

export type AnalyticsPurgeTickOutcome = {
  status: 'completed' | 'skipped' | 'failed';
  run_date: string;
  countries_processed?: number;
  reason?: string;
  error?: string | null;
  event_id?: string;
};

@Injectable()
export class AnalyticsRollupSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsRollupSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private lastCountriesProcessed = 0;
  private lastPurgeCountriesProcessed = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly analyticsWorker: AnalyticsWorkerService,
    private readonly eventWorker: EventWorkerService,
    private readonly handlers: EventHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.handlers.register(ANALYTICS_DAILY_ROLLUP_EVENT, async (envelope) => this.handleRollupEvent(envelope));
    this.handlers.register(CRM_PERSONALIZATION_PURGE_EVENT, async (envelope) => this.handlePurgeEvent(envelope));
    if (process.env['NODE_ENV'] === 'test') {
      return;
    }
    if (!isAnalyticsRollupSchedulerEnabled()) {
      return;
    }
    const pollMs = readAnalyticsRollupSchedulerPollMs();
    this.timer = setInterval(() => {
      void this.runScheduledCycle().catch((error) => {
        this.logger.warn(
          JSON.stringify({
            event: 'analytics_scheduler_tick_failed',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    }, pollMs);
    this.logger.log(JSON.stringify({ event: 'analytics_scheduler_started', poll_ms: pollMs }));
  }

  /** Production poll cycle — daily rollup then retention purge. */
  async runScheduledCycle(): Promise<void> {
    await this.tickOnce();
    await this.tickPurgeOnce();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One scheduler cycle — enqueue (if needed) and process yesterday's rollup. Exposed for e2e. */
  async tickOnce(metricDate = utcDayStart(new Date(Date.now() - 86_400_000))): Promise<AnalyticsRollupTickOutcome> {
    const metricDateKey = metricDate.toISOString().slice(0, 10);
    const occurrenceKey = rollupOccurrenceKey(metricDateKey);

    const published = await this.prisma.outboxEvent.findFirst({
      where: {
        type: ANALYTICS_DAILY_ROLLUP_EVENT,
        occurrenceKey,
        status: OutboxStatus.PUBLISHED,
      },
    });
    if (published) {
      return { status: 'skipped', metric_date: metricDateKey, reason: 'already_completed', event_id: published.id };
    }

    const eventId = await this.ensureRollupOutboxEvent(metricDateKey, occurrenceKey);
    this.logger.log(
      JSON.stringify({
        event: 'analytics_rollup_run_started',
        metric_date: metricDateKey,
        event_id: eventId,
      }),
    );

    try {
      await this.eventWorker.handle(eventId);
    } catch (error) {
      const row = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
      this.logger.error(
        JSON.stringify({
          event: 'analytics_rollup_run_failed',
          metric_date: metricDateKey,
          event_id: eventId,
          error: error instanceof Error ? error.message : String(error),
          last_error: row?.lastError ?? null,
        }),
      );
      return {
        status: 'failed',
        metric_date: metricDateKey,
        event_id: eventId,
        error: row?.lastError ?? (error instanceof Error ? error.message : String(error)),
      };
    }

    const completed = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
    if (completed?.status !== OutboxStatus.PUBLISHED) {
      return {
        status: 'failed',
        metric_date: metricDateKey,
        event_id: eventId,
        error: completed?.lastError ?? 'rollup_outbox_not_published',
      };
    }

    const countriesProcessed = this.lastCountriesProcessed;

    return {
      status: 'completed',
      metric_date: metricDateKey,
      event_id: eventId,
      countries_processed: countriesProcessed,
    };
  }

  /** One scheduler cycle — enqueue (if needed) and process today's retention purge. Exposed for e2e. */
  async tickPurgeOnce(runDate = utcDayStart(new Date())): Promise<AnalyticsPurgeTickOutcome> {
    const runDateKey = runDate.toISOString().slice(0, 10);
    const occurrenceKey = purgeOccurrenceKey(runDateKey);

    const published = await this.prisma.outboxEvent.findFirst({
      where: {
        type: CRM_PERSONALIZATION_PURGE_EVENT,
        occurrenceKey,
        status: OutboxStatus.PUBLISHED,
      },
    });
    if (published) {
      return { status: 'skipped', run_date: runDateKey, reason: 'already_completed', event_id: published.id };
    }

    const eventId = await this.ensurePurgeOutboxEvent(runDateKey, occurrenceKey);
    this.logger.log(
      JSON.stringify({
        event: 'analytics_retention_purge_run_started',
        run_date: runDateKey,
        event_id: eventId,
      }),
    );

    try {
      await this.eventWorker.handle(eventId);
    } catch (error) {
      const row = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
      this.logger.error(
        JSON.stringify({
          event: 'analytics_retention_purge_run_failed',
          run_date: runDateKey,
          event_id: eventId,
          error: error instanceof Error ? error.message : String(error),
          last_error: row?.lastError ?? null,
        }),
      );
      return {
        status: 'failed',
        run_date: runDateKey,
        event_id: eventId,
        error: row?.lastError ?? (error instanceof Error ? error.message : String(error)),
      };
    }

    const completed = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
    if (completed?.status !== OutboxStatus.PUBLISHED) {
      return {
        status: 'failed',
        run_date: runDateKey,
        event_id: eventId,
        error: completed?.lastError ?? 'purge_outbox_not_published',
      };
    }

    return {
      status: 'completed',
      run_date: runDateKey,
      event_id: eventId,
      countries_processed: this.lastPurgeCountriesProcessed,
    };
  }

  private async ensureRollupOutboxEvent(metricDateKey: string, occurrenceKey: string): Promise<string> {
    const existing = await this.prisma.outboxEvent.findFirst({
      where: {
        aggregateId: ANALYTICS_ROLLUP_AGGREGATE_ID,
        type: ANALYTICS_DAILY_ROLLUP_EVENT,
        occurrenceKey,
      },
    });
    if (existing) {
      return existing.id;
    }
    try {
      const row = await this.outbox.enqueue(this.prisma, {
        type: ANALYTICS_DAILY_ROLLUP_EVENT,
        aggregateType: 'AnalyticsRollup',
        aggregateId: ANALYTICS_ROLLUP_AGGREGATE_ID,
        producer: 'analytics',
        payload: { metric_date: metricDateKey },
        occurrenceKey,
      });
      return row.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        const row = await this.prisma.outboxEvent.findFirstOrThrow({
          where: {
            aggregateId: ANALYTICS_ROLLUP_AGGREGATE_ID,
            type: ANALYTICS_DAILY_ROLLUP_EVENT,
            occurrenceKey,
          },
        });
        return row.id;
      }
      throw error;
    }
  }

  private async ensurePurgeOutboxEvent(runDateKey: string, occurrenceKey: string): Promise<string> {
    const existing = await this.prisma.outboxEvent.findFirst({
      where: {
        aggregateId: ANALYTICS_PURGE_AGGREGATE_ID,
        type: CRM_PERSONALIZATION_PURGE_EVENT,
        occurrenceKey,
      },
    });
    if (existing) {
      return existing.id;
    }
    try {
      const row = await this.outbox.enqueue(this.prisma, {
        type: CRM_PERSONALIZATION_PURGE_EVENT,
        aggregateType: 'AnalyticsPurge',
        aggregateId: ANALYTICS_PURGE_AGGREGATE_ID,
        producer: 'analytics',
        payload: { run_date: runDateKey },
        occurrenceKey,
      });
      return row.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        const row = await this.prisma.outboxEvent.findFirstOrThrow({
          where: {
            aggregateId: ANALYTICS_PURGE_AGGREGATE_ID,
            type: CRM_PERSONALIZATION_PURGE_EVENT,
            occurrenceKey,
          },
        });
        return row.id;
      }
      throw error;
    }
  }

  private async handleRollupEvent(envelope: EventEnvelope): Promise<void> {
    const metricDateKey =
      typeof envelope.payload.metric_date === 'string' && envelope.payload.metric_date.trim()
        ? envelope.payload.metric_date.trim()
        : utcDayStart(new Date(Date.now() - 86_400_000)).toISOString().slice(0, 10);
    const metricDate = utcDayStart(new Date(`${metricDateKey}T00:00:00.000Z`));

    this.logger.log(
      JSON.stringify({
        event: 'analytics_rollup_processing',
        metric_date: metricDateKey,
        event_id: envelope.eventId,
      }),
    );

    const results = await this.analyticsWorker.runDailyRollups(metricDate);
    this.lastCountriesProcessed = results.length;

    this.logger.log(
      JSON.stringify({
        event: 'analytics_rollup_run_completed',
        metric_date: metricDateKey,
        event_id: envelope.eventId,
        countries_processed: results.length,
      }),
    );
  }

  private async handlePurgeEvent(envelope: EventEnvelope): Promise<void> {
    const runDateKey =
      typeof envelope.payload.run_date === 'string' && envelope.payload.run_date.trim()
        ? envelope.payload.run_date.trim()
        : utcDayStart(new Date()).toISOString().slice(0, 10);

    this.logger.log(
      JSON.stringify({
        event: 'analytics_retention_purge_processing',
        run_date: runDateKey,
        event_id: envelope.eventId,
      }),
    );

    const results = await this.analyticsWorker.runRetentionPurge();
    this.lastPurgeCountriesProcessed = results.length;

    this.logger.log(
      JSON.stringify({
        event: 'analytics_retention_purge_run_completed',
        run_date: runDateKey,
        event_id: envelope.eventId,
        countries_processed: results.length,
      }),
    );
  }
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../app/prisma.service';
import type { EventEnvelope } from '../../events/envelope';
import { EventHandlerRegistry } from '../../events/handlers';
import { OutboxService } from '../../events/outbox.service';
import { EventWorkerService } from '../../events/worker.service';
import { RefillMarketingService } from './refill-marketing.service';
import {
  CRM_AUTOMATION_AGGREGATE_ID,
  CRM_AUTOMATION_DAILY_EVALUATE_EVENT,
  automationEvaluateOccurrenceKey,
  isCrmAutomationSchedulerEnabled,
  readCrmAutomationSchedulerPollMs,
  utcDayStart,
} from './crm-automation-scheduler.config';

export type CrmAutomationTickOutcome = {
  status: 'completed' | 'skipped' | 'failed';
  run_date: string;
  countries_processed?: number;
  reason?: string;
  error?: string | null;
  event_id?: string;
};

@Injectable()
export class CrmAutomationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrmAutomationSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private lastCountriesProcessed = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly refillMarketing: RefillMarketingService,
    private readonly eventWorker: EventWorkerService,
    private readonly handlers: EventHandlerRegistry,
  ) {}

  onModuleInit(): void {
    this.handlers.register(CRM_AUTOMATION_DAILY_EVALUATE_EVENT, async (envelope) =>
      this.handleEvaluateEvent(envelope),
    );
    if (process.env['NODE_ENV'] === 'test') {
      return;
    }
    if (!isCrmAutomationSchedulerEnabled()) {
      return;
    }
    const pollMs = readCrmAutomationSchedulerPollMs();
    this.timer = setInterval(() => {
      void this.tickOnce().catch((error) => {
        this.logger.warn(
          JSON.stringify({
            event: 'crm_automation_scheduler_tick_failed',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    }, pollMs);
    this.logger.log(JSON.stringify({ event: 'crm_automation_scheduler_started', poll_ms: pollMs }));
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One scheduler cycle — enqueue (if needed) and process today's CRM automation evaluation. Exposed for e2e. */
  async tickOnce(runDate = utcDayStart(new Date())): Promise<CrmAutomationTickOutcome> {
    const runDateKey = runDate.toISOString().slice(0, 10);
    const occurrenceKey = automationEvaluateOccurrenceKey(runDateKey);

    const published = await this.prisma.outboxEvent.findFirst({
      where: {
        type: CRM_AUTOMATION_DAILY_EVALUATE_EVENT,
        occurrenceKey,
        status: OutboxStatus.PUBLISHED,
      },
    });
    if (published) {
      return { status: 'skipped', run_date: runDateKey, reason: 'already_completed', event_id: published.id };
    }

    const eventId = await this.ensureEvaluateOutboxEvent(runDateKey, occurrenceKey);
    this.logger.log(
      JSON.stringify({
        event: 'crm_automation_evaluate_run_started',
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
          event: 'crm_automation_evaluate_run_failed',
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
        error: completed?.lastError ?? 'crm_automation_outbox_not_published',
      };
    }

    return {
      status: 'completed',
      run_date: runDateKey,
      event_id: eventId,
      countries_processed: this.lastCountriesProcessed,
    };
  }

  private async ensureEvaluateOutboxEvent(runDateKey: string, occurrenceKey: string): Promise<string> {
    const existing = await this.prisma.outboxEvent.findFirst({
      where: {
        aggregateId: CRM_AUTOMATION_AGGREGATE_ID,
        type: CRM_AUTOMATION_DAILY_EVALUATE_EVENT,
        occurrenceKey,
      },
    });
    if (existing) {
      return existing.id;
    }
    try {
      const row = await this.outbox.enqueue(this.prisma, {
        type: CRM_AUTOMATION_DAILY_EVALUATE_EVENT,
        aggregateType: 'CrmAutomation',
        aggregateId: CRM_AUTOMATION_AGGREGATE_ID,
        producer: 'crm',
        payload: { run_date: runDateKey },
        occurrenceKey,
      });
      return row.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const row = await this.prisma.outboxEvent.findFirstOrThrow({
          where: {
            aggregateId: CRM_AUTOMATION_AGGREGATE_ID,
            type: CRM_AUTOMATION_DAILY_EVALUATE_EVENT,
            occurrenceKey,
          },
        });
        return row.id;
      }
      throw error;
    }
  }

  private async handleEvaluateEvent(envelope: EventEnvelope): Promise<void> {
    const runDateKey =
      typeof envelope.payload.run_date === 'string' && envelope.payload.run_date.trim()
        ? envelope.payload.run_date.trim()
        : utcDayStart(new Date()).toISOString().slice(0, 10);

    this.logger.log(
      JSON.stringify({
        event: 'crm_automation_evaluate_processing',
        run_date: runDateKey,
        event_id: envelope.eventId,
      }),
    );

    const countries = await this.prisma.country.findMany({
      where: { status: 'ACTIVE' },
      select: { isoAlpha2: true },
      orderBy: { isoAlpha2: 'asc' },
    });

    let processed = 0;
    for (const country of countries) {
      const result = await this.refillMarketing.evaluateCountryScheduled(country.isoAlpha2);
      if (result.status === 'completed') {
        processed += 1;
      }
    }
    this.lastCountriesProcessed = processed;

    this.logger.log(
      JSON.stringify({
        event: 'crm_automation_evaluate_run_completed',
        run_date: runDateKey,
        event_id: envelope.eventId,
        countries_processed: processed,
      }),
    );
  }
}

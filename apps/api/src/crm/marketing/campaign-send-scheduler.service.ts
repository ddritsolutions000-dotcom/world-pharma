import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CrmCampaignStatus, OutboxStatus, Prisma } from '@prisma/client';
import { PrismaService, runWithTenant } from '../../app/prisma.service';
import type { EventEnvelope } from '../../events/envelope';
import { EventHandlerRegistry } from '../../events/handlers';
import { OutboxService } from '../../events/outbox.service';
import { EventWorkerService } from '../../events/worker.service';
import { PolicyResolver } from '../../policy/resolver';
import { workerTenantContext } from '../../tenancy/build-tenant-context';
import {
  CRM_CAMPAIGN_SCHEDULED_SEND_SCAN_EVENT,
  CRM_CAMPAIGN_SEND_AGGREGATE_ID,
  campaignSendScanOccurrenceKey,
  isCampaignSendSchedulerEnabled,
  readCampaignSendSchedulerPollMs,
} from './campaign-send-scheduler.config';
import { SendPipelineService } from './send-pipeline.service';

export type CampaignSendTickOutcome = {
  status: 'completed' | 'skipped' | 'failed';
  scan_at: string;
  campaigns_processed?: number;
  reason?: string;
  error?: string | null;
  event_id?: string;
};

@Injectable()
export class CampaignSendSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignSendSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private lastCampaignsProcessed = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly sendPipeline: SendPipelineService,
    private readonly eventWorker: EventWorkerService,
    private readonly handlers: EventHandlerRegistry,
    private readonly policies: PolicyResolver,
  ) {}

  onModuleInit(): void {
    this.handlers.register(CRM_CAMPAIGN_SCHEDULED_SEND_SCAN_EVENT, async (envelope) =>
      this.handleScanEvent(envelope),
    );
    if (process.env['NODE_ENV'] === 'test') {
      return;
    }
    if (!isCampaignSendSchedulerEnabled()) {
      return;
    }
    const pollMs = readCampaignSendSchedulerPollMs();
    this.timer = setInterval(() => {
      void this.tickOnce().catch((error) => {
        this.logger.warn(
          JSON.stringify({
            event: 'campaign_send_scheduler_tick_failed',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      });
    }, pollMs);
    this.logger.log(JSON.stringify({ event: 'campaign_send_scheduler_started', poll_ms: pollMs }));
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One scheduler cycle — enqueue (if needed) and process due campaigns. Exposed for e2e. */
  async tickOnce(scanAt = new Date()): Promise<CampaignSendTickOutcome> {
    const scanAtIso = scanAt.toISOString();
    const occurrenceKey = campaignSendScanOccurrenceKey(scanAt);

    const published = await this.prisma.outboxEvent.findFirst({
      where: {
        type: CRM_CAMPAIGN_SCHEDULED_SEND_SCAN_EVENT,
        occurrenceKey,
        status: OutboxStatus.PUBLISHED,
      },
    });
    if (published) {
      return {
        status: 'skipped',
        scan_at: scanAtIso,
        reason: 'already_completed',
        event_id: published.id,
      };
    }

    const eventId = await this.ensureScanOutboxEvent(scanAtIso, occurrenceKey);
    this.logger.log(
      JSON.stringify({
        event: 'campaign_send_scan_started',
        scan_at: scanAtIso,
        event_id: eventId,
      }),
    );

    try {
      await this.eventWorker.handle(eventId);
    } catch (error) {
      const row = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
      this.logger.error(
        JSON.stringify({
          event: 'campaign_send_scan_failed',
          scan_at: scanAtIso,
          event_id: eventId,
          error: error instanceof Error ? error.message : String(error),
          last_error: row?.lastError ?? null,
        }),
      );
      return {
        status: 'failed',
        scan_at: scanAtIso,
        event_id: eventId,
        error: row?.lastError ?? (error instanceof Error ? error.message : String(error)),
      };
    }

    const completed = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
    if (completed?.status !== OutboxStatus.PUBLISHED) {
      return {
        status: 'failed',
        scan_at: scanAtIso,
        event_id: eventId,
        error: completed?.lastError ?? 'campaign_send_scan_outbox_not_published',
      };
    }

    return {
      status: 'completed',
      scan_at: scanAtIso,
      event_id: eventId,
      campaigns_processed: this.lastCampaignsProcessed,
    };
  }

  private async ensureScanOutboxEvent(scanAtIso: string, occurrenceKey: string): Promise<string> {
    const existing = await this.prisma.outboxEvent.findFirst({
      where: {
        aggregateId: CRM_CAMPAIGN_SEND_AGGREGATE_ID,
        type: CRM_CAMPAIGN_SCHEDULED_SEND_SCAN_EVENT,
        occurrenceKey,
      },
    });
    if (existing) {
      return existing.id;
    }
    try {
      const row = await this.outbox.enqueue(this.prisma, {
        type: CRM_CAMPAIGN_SCHEDULED_SEND_SCAN_EVENT,
        aggregateType: 'CrmCampaignSendScan',
        aggregateId: CRM_CAMPAIGN_SEND_AGGREGATE_ID,
        producer: 'marketing',
        payload: { scan_at: scanAtIso },
        occurrenceKey,
      });
      return row.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const row = await this.prisma.outboxEvent.findFirstOrThrow({
          where: {
            aggregateId: CRM_CAMPAIGN_SEND_AGGREGATE_ID,
            type: CRM_CAMPAIGN_SCHEDULED_SEND_SCAN_EVENT,
            occurrenceKey,
          },
        });
        return row.id;
      }
      throw error;
    }
  }

  private async handleScanEvent(envelope: EventEnvelope): Promise<void> {
    const scanAt =
      typeof envelope.payload.scan_at === 'string' && envelope.payload.scan_at.trim()
        ? new Date(envelope.payload.scan_at.trim())
        : new Date();

    this.logger.log(
      JSON.stringify({
        event: 'campaign_send_scan_processing',
        scan_at: scanAt.toISOString(),
        event_id: envelope.eventId,
      }),
    );

    const countries = await this.prisma.country.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, isoAlpha2: true },
      orderBy: { isoAlpha2: 'asc' },
    });

    let processed = 0;
    for (const country of countries) {
      if (!(await this.isMarketingEnabled(country.isoAlpha2))) {
        continue;
      }
      await runWithTenant(workerTenantContext({ countryId: country.id }), async () => {
        const due = await this.prisma.crmCampaign.findMany({
          where: {
            countryId: country.id,
            status: CrmCampaignStatus.SCHEDULED,
            scheduledAt: { lte: scanAt },
          },
          select: { id: true },
          orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        });
        for (const campaign of due) {
          const result = await this.sendPipeline.sendCampaignScheduled(
            campaign.id,
            country.isoAlpha2,
            scanAt,
          );
          if (result.status === CrmCampaignStatus.COMPLETED) {
            processed += 1;
          }
        }
      });
    }
    this.lastCampaignsProcessed = processed;

    this.logger.log(
      JSON.stringify({
        event: 'campaign_send_scan_completed',
        scan_at: scanAt.toISOString(),
        event_id: envelope.eventId,
        campaigns_processed: processed,
      }),
    );
  }

  private async isMarketingEnabled(countryCode: string): Promise<boolean> {
    const policy = await this.policies.resolvePublished(countryCode);
    if (!policy?.document.crm?.enabled) {
      return false;
    }
    if (policy.document.crm.marketing?.enabled === false) {
      return false;
    }
    return true;
  }
}

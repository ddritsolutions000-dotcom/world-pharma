import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../app/prisma.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { MetricsService } from '../common/metrics.service';
import { type EventEnvelope, sanitizeErrorMessage } from './envelope';
import { EventHandlerRegistry } from './handlers';
import { InboxService } from './inbox.service';
import { bullmqConnectionOptions, DOMAIN_EVENTS_QUEUE } from './queue.constants';
import { OutboxDispatcherService } from './dispatcher.service';
import { redisMeetsBullMq } from './redis-support';
import { requireRedisUrl } from './redis-url';

export interface DispatchJob {
  eventId: string;
  correlationId?: string | null;
}

@Injectable()
export class EventWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventWorkerService.name);
  private worker: Worker<DispatchJob> | null = null;
  private connection: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inbox: InboxService,
    private readonly registry: EventHandlerRegistry,
    private readonly dispatcher: OutboxDispatcherService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env['NODE_ENV'] === 'test') {
      return;
    }
    if (!(await redisMeetsBullMq(this.logger))) {
      return;
    }
    this.start();
  }

  async waitUntilReady(): Promise<void> {
    await this.worker?.waitUntilReady();
  }

  start(): void {
    if (this.worker) {
      return;
    }
    const url = requireRedisUrl();
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    const concurrency = Number(process.env['OUTBOX_WORKER_CONCURRENCY'] ?? 4);
    try {
      this.worker = new Worker<DispatchJob>(
        DOMAIN_EVENTS_QUEUE,
        async (job) => this.handle(job.data.eventId),
        bullmqConnectionOptions({ connection: this.connection, concurrency }),
      );
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'outbox_worker_disabled',
          error: sanitizeErrorMessage(error),
          hint: 'BullMQ needs Redis 5+. Point REDIS_URL at Compose Redis 7.',
        }),
      );
      this.connection.disconnect();
      this.connection = null;
      return;
    }
    this.worker.on('error', (error) => {
      this.logger.error(
        JSON.stringify({
          event: 'outbox_worker_error',
          error: sanitizeErrorMessage(error),
          hint: 'BullMQ needs Redis 5+. Point REDIS_URL at Compose Redis 7.',
        }),
      );
    });
    this.worker.on('failed', (job, error) => {
      this.logger.warn(
        JSON.stringify({
          event: 'handler_failed',
          event_id: job?.data.eventId,
          error: sanitizeErrorMessage(error),
        }),
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    if (this.connection) {
      this.connection.removeAllListeners();
      try {
        await this.connection.quit();
      } catch {
        this.connection.disconnect();
      }
      this.connection = null;
    }
    this.worker = null;
  }

  async handle(eventId: string): Promise<void> {
    const bootstrap = await this.prisma.runWithTenant(workerTenantContext(), () =>
      this.prisma.outboxEvent.findUnique({ where: { id: eventId } }),
    );
    if (!bootstrap || bootstrap.status === 'PUBLISHED') {
      return;
    }
    try {
      await this.prisma.runWithTenant(
        workerTenantContext({
          organizationId: bootstrap.organizationId,
          countryId: bootstrap.countryId,
          regionId: bootstrap.regionId,
          legalEntityId: bootstrap.legalEntityId,
          personId: bootstrap.actorId,
        }),
        () => this.handleInner(eventId),
      );
    } catch (error) {
      await this.prisma.runWithTenant(workerTenantContext(), () =>
        this.dispatcher.fail(eventId, bootstrap.attempts, error),
      );
      throw error;
    }
  }

  private async handleInner(eventId: string): Promise<void> {
    const row = await this.prisma.outboxEvent.findUnique({ where: { id: eventId } });
    if (!row || row.status === 'PUBLISHED') {
      return;
    }
    const envelope: EventEnvelope = {
      eventId: row.id,
      eventName: row.type,
      eventVersion: row.schemaVersion,
      occurredAt: row.createdAt.toISOString(),
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      producer: row.producer,
      countryId: row.countryId,
      correlationId: row.correlationId,
      causationId: row.causationId,
      actorId: row.actorId,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      metadata: {},
    };
    this.logger.log(
      JSON.stringify({
        event: 'event_handling',
        event_id: envelope.eventId,
        event_name: envelope.eventName,
        correlation_id: envelope.correlationId,
      }),
    );
    const handlers = this.registry.handlersFor(envelope.eventName);
    for (const [index, handler] of handlers.entries()) {
      const consumer = `${envelope.eventName}:${index}:${handler.name || 'anon'}`;
      const first = await this.inbox.tryBegin(consumer, envelope.eventId);
      if (!first) {
        continue;
      }
      try {
        await handler(envelope);
      } catch (error) {
        await this.inbox.release(consumer, envelope.eventId);
        throw error;
      }
    }
    await this.prisma.outboxEvent.update({
      where: { id: row.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        processedAt: new Date(),
        lastError: null,
      },
    });
    this.metrics.increment('bullmq_jobs_processed_total');
  }
}

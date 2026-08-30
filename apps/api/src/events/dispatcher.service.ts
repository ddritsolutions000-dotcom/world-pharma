import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../app/prisma.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { MetricsService } from '../common/metrics.service';
import { backoffMs, sanitizeErrorMessage } from './envelope';
import { bullmqConnectionOptions, DOMAIN_EVENTS_QUEUE } from './queue.constants';
import { redisMeetsBullMq } from './redis-support';
import { requireRedisUrl } from './redis-url';
import type { DispatchJob } from './worker.service';

const STALE_MS = 120_000;

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private timer: NodeJS.Timeout | null = null;
  private queue: Queue<DispatchJob> | null = null;
  private connection: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  get maxAttempts(): number {
    return Number(process.env['OUTBOX_MAX_ATTEMPTS'] ?? 8);
  }

  get batchSize(): number {
    return Number(process.env['OUTBOX_BATCH_SIZE'] ?? 20);
  }

  isActive(): boolean {
    return this.queue !== null;
  }

  async onModuleInit(): Promise<void> {
    if (process.env['NODE_ENV'] === 'test') {
      return;
    }
    if (!(await redisMeetsBullMq(this.logger))) {
      return;
    }
    this.connectQueue();
    const pollMs = Number(process.env['OUTBOX_POLL_MS'] ?? 1000);
    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        this.logger.error(
          JSON.stringify({ event: 'dispatch_tick_failed', error: sanitizeErrorMessage(error) }),
        );
      });
    }, pollMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.queue?.close();
    this.queue = null;
    if (this.connection) {
      this.connection.removeAllListeners();
      try {
        await this.connection.quit();
      } catch {
        this.connection.disconnect();
      }
      this.connection = null;
    }
  }

  connectQueue(): Queue<DispatchJob> {
    if (this.queue) {
      return this.queue;
    }
    const url = requireRedisUrl();
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue<DispatchJob>(
      DOMAIN_EVENTS_QUEUE,
      bullmqConnectionOptions({ connection: this.connection }),
    );
    this.queue.on('error', (error) => {
      this.logger.error(
        JSON.stringify({
          event: 'outbox_queue_error',
          error: sanitizeErrorMessage(error),
          hint: 'BullMQ needs Redis 5+. Point REDIS_URL at Compose Redis 7.',
        }),
      );
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    });
    return this.queue;
  }

  async tick(): Promise<number> {
    return this.prisma.runWithTenant(workerTenantContext(), async () => this.tickInner());
  }

  private async tickInner(): Promise<number> {
    await this.reclaimStale();
    const claimed = await this.claimBatch();
    let dispatched = 0;
    for (const row of claimed) {
      try {
        await this.connectQueue().add(
          'dispatch',
          { eventId: row.id, correlationId: row.correlationId },
          { jobId: row.id, attempts: 1, removeOnComplete: 1000, removeOnFail: 5000 },
        );
        dispatched += 1;
        this.metrics.increment('outbox_processed_total');
        this.logger.log(
          JSON.stringify({
            event: 'outbox_dispatched',
            event_id: row.id,
            event_name: row.type,
            attempts: row.attempts + 1,
          }),
        );
      } catch (error) {
        this.metrics.increment('outbox_failed_total');
        await this.fail(row.id, row.attempts, error);
      }
    }
    return dispatched;
  }

  async reclaimStale(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_MS);
    await this.prisma.outboxEvent.updateMany({
      where: { status: 'PROCESSING', updatedAt: { lt: cutoff } },
      data: { status: 'PENDING', availableAt: new Date() },
    });
  }

  async claimBatch(): Promise<
    { id: string; type: string; attempts: number; correlationId: string | null }[]
  > {
    const pending = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING', availableAt: { lte: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: this.batchSize,
    });
    const claimed: { id: string; type: string; attempts: number; correlationId: string | null }[] =
      [];
    for (const row of pending) {
      const updated = await this.prisma.outboxEvent.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status: 'PROCESSING' },
      });
      if (updated.count === 1) {
        claimed.push({
          id: row.id,
          type: row.type,
          attempts: row.attempts,
          correlationId: row.correlationId,
        });
      }
    }
    return claimed;
  }

  async fail(eventId: string, previousAttempts: number, error: unknown): Promise<void> {
    const attempts = previousAttempts + 1;
    const dead = attempts >= this.maxAttempts;
    if (dead) {
      this.metrics.increment('outbox_dead_lettered_total');
    }
    await this.prisma.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: dead ? 'DEAD_LETTERED' : 'PENDING',
        attempts,
        failedAt: new Date(),
        lastError: sanitizeErrorMessage(error),
        availableAt: dead ? new Date() : new Date(Date.now() + backoffMs(attempts)),
      },
    });
    this.logger.warn(
      JSON.stringify({
        event: dead ? 'outbox_dead_lettered' : 'outbox_retry_scheduled',
        event_id: eventId,
        attempts,
      }),
    );
  }
}

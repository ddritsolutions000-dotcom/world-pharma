import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { LogisticsService } from './logistics.service';
import { PrismaService } from '../app/prisma.service';
import { workerTenantContext } from '../tenancy/build-tenant-context';
import { bullmqConnectionOptions } from '../events/queue.constants';
import { redisMeetsBullMq } from '../events/redis-support';
import { requireRedisUrl } from '../events/redis-url';

export const LOGISTICS_BOOKING_QUEUE = 'logistics-booking';

@Injectable()
export class LogisticsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogisticsWorker.name);
  private worker: Worker | null = null;
  private queue: Queue | null = null;
  private connection: Redis | null = null;

  constructor(
    private readonly logistics: LogisticsService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env['NODE_ENV'] === 'test') {
      return;
    }
    if (!(await redisMeetsBullMq(this.logger))) {
      return;
    }
    const url = requireRedisUrl();
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.queue = new Queue(LOGISTICS_BOOKING_QUEUE, bullmqConnectionOptions({ connection: this.connection }));
    this.worker = new Worker(
      LOGISTICS_BOOKING_QUEUE,
      async (job) => {
        await this.prisma.runWithTenant(workerTenantContext(), () =>
          this.logistics.executeBooking(job.data.shipmentId as string),
        );
      },
      bullmqConnectionOptions({ connection: this.connection, concurrency: 4 }),
    );
    this.logger.log(JSON.stringify({ event: 'logistics_worker_started', sandbox: true, live_dhl: false }));
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.connection?.disconnect();
  }
}

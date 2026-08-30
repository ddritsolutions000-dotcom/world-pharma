import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { OutboxDispatcherService } from './dispatcher.service';
import { EventHandlerRegistry } from './handlers';
import { OutboxService } from './outbox.service';
import { probeRedis } from './redis-support';
import { applyTestIsolation } from '../test/isolate-runtime';
import { EventWorkerService } from './worker.service';

describe('transactional outbox', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let outbox: OutboxService;
  let dispatcher: OutboxDispatcherService;
  let worker: EventWorkerService;
  let registry: EventHandlerRegistry;

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['OUTBOX_MAX_ATTEMPTS'] = '3';
    process.env['OUTBOX_BATCH_SIZE'] = '1';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    if (!process.env['REDIS_URL']) {
      throw new Error('REDIS_URL is required');
    }
    const redis = new Redis(process.env['REDIS_URL']);
    await redis.flushdb();
    redis.disconnect();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);
    outbox = app.get(OutboxService);
    dispatcher = app.get(OutboxDispatcherService);
    worker = app.get(EventWorkerService);
    registry = app.get(EventHandlerRegistry);
  });

  beforeEach(async () => {
    await prisma.inboxReceipt.deleteMany();
    await prisma.outboxEvent.deleteMany();
  });

  afterAll(async () => {
    await worker.onModuleDestroy();
    await dispatcher.onModuleDestroy();
    await app.close();
  });

  it('commits business row and outbox together, and rolls back both', async () => {
    const id = uuidv7();
    await prisma.$transaction(async (tx) => {
      await outbox.enqueue(tx, {
        type: 'USER_REGISTERED',
        aggregateType: 'Person',
        aggregateId: id,
        producer: 'test',
        payload: { person_id: id },
        occurrenceKey: 'ok',
      });
    });
    const kept = await prisma.outboxEvent.findFirst({ where: { aggregateId: id } });
    expect(kept?.status).toBe('PENDING');

    const boomId = uuidv7();
    await expect(
      prisma.$transaction(async (tx) => {
        await outbox.enqueue(tx, {
          type: 'USER_REGISTERED',
          aggregateType: 'Person',
          aggregateId: boomId,
          producer: 'test',
          payload: { person_id: boomId },
          occurrenceKey: 'boom',
        });
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');
    const missing = await prisma.outboxEvent.findFirst({ where: { aggregateId: boomId } });
    expect(missing).toBeNull();
  });

  it('claims once under concurrency and dead-letters after max attempts', async () => {
    await prisma.outboxEvent.deleteMany();
    const id = uuidv7();
    await outbox.enqueue(prisma, {
      type: 'PARTNER_CREATED',
      aggregateType: 'Partner',
      aggregateId: id,
      producer: 'test',
      payload: { partner_id: id },
      occurrenceKey: 'once',
    });
    const created = await prisma.outboxEvent.findFirst({ where: { aggregateId: id } });
    expect(created).toBeDefined();
    const [a, b] = await Promise.all([dispatcher.claimBatch(), dispatcher.claimBatch()]);
    const ids = [...a, ...b].map((row) => row.id);
    expect(ids.filter((value) => value === created?.id)).toHaveLength(1);

    const row = await prisma.outboxEvent.findFirst({ where: { aggregateId: id } });
    if (!row) {
      throw new Error('missing outbox row');
    }
    await dispatcher.fail(row.id, 0, new Error('otp=111111 transient'));
    await dispatcher.fail(row.id, 1, new Error('still failing'));
    await dispatcher.fail(row.id, 2, new Error('token=secret-value'));
    const dead = await prisma.outboxEvent.findUnique({ where: { id: row.id } });
    expect(dead?.status).toBe('DEAD_LETTERED');
    expect(dead?.attempts).toBe(3);
    expect(dead?.lastError).not.toContain('secret-value');
    expect(JSON.stringify(dead)).not.toContain('111111');
  });

  it('runs handlers once when delivered twice', async () => {
    const id = uuidv7();
    let calls = 0;
    registry.register('USER_REGISTERED', async () => {
      calls += 1;
    });
    const row = await outbox.enqueue(prisma, {
      type: 'USER_REGISTERED',
      aggregateType: 'Person',
      aggregateId: id,
      producer: 'test',
      payload: { person_id: id, otp: 'should-not-store' },
      occurrenceKey: 'idem',
    });
    expect(JSON.stringify(row.payload)).not.toContain('should-not-store');
    await worker.handle(row.id);
    await worker.handle(row.id);
    expect(calls).toBe(1);
    const published = await prisma.outboxEvent.findUnique({ where: { id: row.id } });
    expect(published?.status).toBe('PUBLISHED');
  });

  it('retries a failing handler then succeeds', async () => {
    const id = uuidv7();
    let calls = 0;
    registry.register('USER_REGISTERED', async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('transient');
      }
    });
    const row = await outbox.enqueue(prisma, {
      type: 'USER_REGISTERED',
      aggregateType: 'Person',
      aggregateId: id,
      producer: 'test',
      payload: { person_id: id },
      occurrenceKey: 'retry',
    });
    await expect(worker.handle(row.id)).rejects.toThrow('transient');
    const mid = await prisma.outboxEvent.findUnique({ where: { id: row.id } });
    expect(mid?.attempts).toBe(1);
    expect(mid?.status).toBe('PENDING');
    await prisma.outboxEvent.update({
      where: { id: row.id },
      data: { availableAt: new Date() },
    });
    await worker.handle(row.id);
    expect(calls).toBe(2);
    const done = await prisma.outboxEvent.findUnique({ where: { id: row.id } });
    expect(done?.status).toBe('PUBLISHED');
  });

  it(
    'processes a real BullMQ job against Redis 7',
    async () => {
    const runtime = await probeRedis();
    expect(runtime.bullMqCompatible).toBe(true);
    expect(runtime.version).toMatch(/^7\./);
    worker.start();
    await worker.waitUntilReady();
    dispatcher.connectQueue();
    const id = uuidv7();
    await outbox.enqueue(prisma, {
      type: 'USER_REGISTERED',
      aggregateType: 'Person',
      aggregateId: id,
      producer: 'test',
      payload: { person_id: id },
      occurrenceKey: 'bullmq',
    });
    const claimDeadline = Date.now() + 5_000;
    let afterTick = await prisma.outboxEvent.findFirst({ where: { aggregateId: id } });
    while (Date.now() < claimDeadline && afterTick?.status === 'PENDING') {
      await dispatcher.tick();
      afterTick = await prisma.outboxEvent.findFirst({ where: { aggregateId: id } });
    }
    if (afterTick?.status === 'PENDING') {
      throw new Error(`dispatch did not claim job: ${afterTick.lastError ?? 'no error'}`);
    }
    const deadline = Date.now() + 10_000;
    let row = await prisma.outboxEvent.findFirst({ where: { aggregateId: id } });
    while (Date.now() < deadline && row?.status !== 'PUBLISHED') {
      await new Promise((resolve) => setTimeout(resolve, 100));
      row = await prisma.outboxEvent.findFirst({ where: { aggregateId: id } });
    }
    expect(row?.status).toBe('PUBLISHED');
    },
    20_000,
  );

  it('dispatches via BullMQ and has no public publish route', async () => {
    const id = uuidv7();
    await outbox.enqueue(prisma, {
      type: 'PARTNER_STATUS_CHANGED',
      aggregateType: 'Partner',
      aggregateId: id,
      producer: 'test',
      payload: { partner_id: id },
      occurrenceKey: 'queue',
    });
    const claimed = await dispatcher.claimBatch();
    expect(claimed).toHaveLength(1);
    const first = claimed[0];
    expect(first).toBeDefined();
    if (!first) {
      throw new Error('expected claimed outbox row');
    }
    await worker.handle(first.id);
    const publish = await request(app.getHttpServer()).post('/api/v1/events').send({ type: 'USER_REGISTERED' });
    expect(publish.status).toBeGreaterThanOrEqual(400);
    const health = await request(app.getHttpServer()).get('/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });
  });
});

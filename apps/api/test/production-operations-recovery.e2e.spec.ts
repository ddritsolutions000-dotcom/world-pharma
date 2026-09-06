import { INestApplication } from '@nestjs/common';
import { OutboxStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../src/app/app.module';
import { PrismaService } from '../src/app/prisma.service';
import { ProblemFilter } from '../src/common/problem.filter';
import { MetricsService } from '../src/common/metrics.service';
import { EventHandlerRegistry } from '../src/events/handlers';
import { OutboxDispatcherService } from '../src/events/dispatcher.service';
import { OutboxService } from '../src/events/outbox.service';
import { EventWorkerService } from '../src/events/worker.service';
import { LocalPrivateObjectStore } from '../src/partner/object-store';
import { NotificationDispatchService } from '../src/platform/notification-dispatch.service';
import { NotificationService } from '../src/platform/notification.service';
import { isLivePaymentEnabled } from '../src/payment/payment.config';
import { applyTestIsolation } from '../src/test/isolate-runtime';
import { provisionSuperAdmin, signInCustomer } from '../src/test/sign-in';
import type { EventEnvelope } from '../src/events/envelope';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function envelopeFromOutbox(row: {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  producer: string;
  countryId: string | null;
  correlationId: string | null;
  actorId: string | null;
  payload: unknown;
  createdAt: Date;
}): EventEnvelope {
  return {
    eventId: row.id,
    eventName: row.type,
    eventVersion: 1,
    occurredAt: row.createdAt.toISOString(),
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    producer: row.producer,
    countryId: row.countryId,
    correlationId: row.correlationId,
    causationId: null,
    actorId: row.actorId,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    metadata: {},
  };
}

describe('production operations recovery (e2e)', () => {
  jest.setTimeout(300_000);
  process.env['OUTBOX_MAX_ATTEMPTS'] = '3';

  let app: INestApplication;
  let prisma: PrismaService;
  let outbox: OutboxService;
  let dispatcher: OutboxDispatcherService;
  let worker: EventWorkerService;
  let registry: EventHandlerRegistry;
  let notifications: NotificationService;
  let dispatch: NotificationDispatchService;
  let metrics: MetricsService;
  let superToken: string;
  let superPersonId: string;

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['OUTBOX_MAX_ATTEMPTS'] = process.env['OUTBOX_MAX_ATTEMPTS'] ?? '3';
    process.env['PAYMENT_LIVE_ENABLED'] = 'false';
    if (!process.env['REDIS_URL']) {
      throw new Error('REDIS_URL is required');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready', 'health/version', 'metrics'] });
    await app.init();
    prisma = app.get(PrismaService);
    outbox = app.get(OutboxService);
    dispatcher = app.get(OutboxDispatcherService);
    worker = app.get(EventWorkerService);
    registry = app.get(EventHandlerRegistry);
    notifications = app.get(NotificationService);
    dispatch = app.get(NotificationDispatchService);
    metrics = app.get(MetricsService);

    const admin = await provisionSuperAdmin(app, prisma, `s33-ops`);
    superToken = admin.token;
    superPersonId = admin.personId;
  });

  afterAll(async () => {
    await worker.onModuleDestroy().catch(() => undefined);
    await dispatcher.onModuleDestroy().catch(() => undefined);
    await app.close();
  });

  it('liveness/readiness/correlation/metrics stay safe and truthful', async () => {
    const live = await request(app.getHttpServer()).get('/health');
    expect(live.status).toBe(200);
    expect(live.body).toEqual({ status: 'ok' });
    expect(JSON.stringify(live.body)).not.toMatch(/password|secret|token|otp/i);

    const ready = await request(app.getHttpServer()).get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.postgres).toBe('up');
    expect(ready.body.redis).toBe('up');
    expect(ready.body.status).toBe('ready');
    expect(ready.body.runtime.dependencies.find((d: { name: string }) => d.name === 'payments')?.mode).toBe(
      'sandbox',
    );
    expect(JSON.stringify(ready.body)).not.toMatch(/JWT_ACCESS_SECRET|OTP_PEPPER|DATABASE_URL=/i);

    const problem = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .set('x-correlation-id', 's33-corr-ops-1')
      .send({ unexpected: true });
    expect(problem.status).toBe(400);
    expect(problem.headers['x-correlation-id']).toBe('s33-corr-ops-1');
    expect(problem.body.correlation_id).toBe('s33-corr-ops-1');
    expect(problem.body.request_id).toBeDefined();

    const metricsRes = await request(app.getHttpServer()).get('/metrics');
    expect(metricsRes.status).toBe(200);
    expect(metricsRes.text).toMatch(/outbox_pending|postgres_ready|redis_ready/);
    expect(metricsRes.text).not.toMatch(/JWT_ACCESS_SECRET|OTP_PEPPER|postgresql:\/\/.*:.*@/);

    expect(isLivePaymentEnabled()).toBe(false);
  });

  it('rate-limits OTP with truthful 429 Retry-After', async () => {
    const identifier = `s33.rl.${Date.now()}@example.com`;
    let limited = false;
    for (let i = 0; i < 15; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ identifier });
      if (res.status === 429) {
        limited = true;
        expect(res.headers['retry-after']).toBeDefined();
        expect(res.body.retry_after_seconds).toBeGreaterThan(0);
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it('outbox retry, dead-letter visibility, and duplicate consumer safety', async () => {
    const aggregateId = uuidv7();
    const correlationId = uuidv7();
    const row = await outbox.enqueue(prisma, {
      type: 'USER_REGISTERED',
      aggregateType: 'Person',
      aggregateId,
      producer: 's33-test',
      correlationId,
      payload: { person_id: aggregateId },
      occurrenceKey: `s33-retry-${aggregateId}`,
    });
    expect(row.correlationId).toBe(correlationId);

    let calls = 0;
    registry.register('USER_REGISTERED', async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error('transient-s33');
      }
    });

    await expect(worker.handle(row.id)).rejects.toThrow('transient-s33');
    const mid = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: row.id } });
    expect(mid.status).toBe(OutboxStatus.PENDING);
    expect(mid.attempts).toBe(1);
    expect(mid.correlationId).toBe(correlationId);
    expect(mid.occurrenceKey).toBe(`s33-retry-${aggregateId}`);

    await prisma.outboxEvent.update({
      where: { id: row.id },
      data: { availableAt: new Date() },
    });
    await worker.handle(row.id);
    expect(calls).toBe(2);
    await worker.handle(row.id);
    expect(calls).toBe(2);

    const poisonId = uuidv7();
    const poison = await outbox.enqueue(prisma, {
      type: 'PARTNER_CREATED',
      aggregateType: 'Partner',
      aggregateId: poisonId,
      producer: 's33-test',
      correlationId: uuidv7(),
      payload: { partner_id: poisonId },
      occurrenceKey: `s33-dlq-${poisonId}`,
    });
    await dispatcher.fail(poison.id, 0, new Error('fail-1'));
    await dispatcher.fail(poison.id, 1, new Error('fail-2'));
    await dispatcher.fail(poison.id, 2, new Error('fail-3'));
    const dead = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: poison.id } });
    expect(dead.status).toBe(OutboxStatus.DEAD_LETTERED);

    const snap = await request(app.getHttpServer())
      .get('/api/v1/admin/control-plane/reliability/snapshot')
      .set(auth(superToken));
    expect(snap.status).toBe(200);
    expect(snap.body.outbox.dead_lettered).toBeGreaterThanOrEqual(1);
    expect(snap.body.replay_available).toBe(false);
    expect(snap.body.dependency_readiness.health_ready_path).toBe('/health/ready');

    const listed = await request(app.getHttpServer())
      .get('/api/v1/admin/control-plane/reliability/outbox?status=DEAD_LETTERED')
      .set(auth(superToken));
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((row: { id: string }) => row.id === poison.id)).toBe(true);

    const denied = await request(app.getHttpServer()).get(
      '/api/v1/admin/control-plane/reliability/snapshot',
    );
    expect(denied.status).toBe(401);
  });

  it('notification and affiliate lifecycle duplicates remain suppressed', async () => {
    const person = await signInCustomer(app, `s33-notif-${uuidv7()}@example.test`);
    const aggregateId = uuidv7();
    const envelope: EventEnvelope = {
      eventId: uuidv7(),
      eventName: 'AFFILIATE_APPROVED',
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      aggregateType: 'AffiliateLiability',
      aggregateId,
      producer: 's33-test',
      countryId: null,
      correlationId: uuidv7(),
      causationId: null,
      actorId: null,
      payload: {
        person_ids: [person.personId],
        affiliate_person_id: person.personId,
        liability_id: aggregateId,
        country_code: 'S3',
        sandbox: true,
      },
      metadata: {},
    };
    await dispatch.handleDomainEvent(envelope);
    await dispatch.handleDomainEvent(envelope);
    const inbox = await notifications.listInbox(person.personId);
    const matches = inbox.filter(
      (row) => row.event_type === 'AFFILIATE_APPROVED' && row.reference_id === aggregateId,
    );
    expect(matches).toHaveLength(1);

    const liabilityId = uuidv7();
    const occurrenceKey = 'AFFILIATE_APPROVED:APPROVED';
    await prisma.$transaction(async (tx) => {
      await outbox.enqueue(tx, {
        type: 'AFFILIATE_APPROVED',
        aggregateType: 'AffiliateLiability',
        aggregateId: liabilityId,
        producer: 'finance',
        payload: { liability_id: liabilityId, status: 'APPROVED', person_ids: [person.personId] },
        occurrenceKey,
      });
    });
    await expect(
      prisma.$transaction(async (tx) => {
        await outbox.enqueue(tx, {
          type: 'AFFILIATE_APPROVED',
          aggregateType: 'AffiliateLiability',
          aggregateId: liabilityId,
          producer: 'finance',
          payload: { liability_id: liabilityId, status: 'APPROVED', person_ids: [person.personId] },
          occurrenceKey,
        });
      }),
    ).rejects.toThrow();
    const count = await prisma.outboxEvent.count({
      where: { aggregateId: liabilityId, type: 'AFFILIATE_APPROVED', occurrenceKey },
    });
    expect(count).toBe(1);
  });

  it('idempotency records and settlement uniqueness stay durable', async () => {
    const key = `s33-idem-${uuidv7()}`;
    await prisma.idempotencyRecord.create({
      data: {
        id: uuidv7(),
        personId: superPersonId,
        key,
        method: 'POST',
        path: '/payments/intents/x/refund',
        statusCode: 200,
        body: { ok: true },
      },
    });
    await expect(
      prisma.idempotencyRecord.create({
        data: {
          id: uuidv7(),
          personId: superPersonId,
          key,
          method: 'POST',
          path: '/payments/intents/x/refund',
          statusCode: 200,
          body: { ok: true },
        },
      }),
    ).rejects.toThrow();

    const lookup = await request(app.getHttpServer())
      .get(`/api/v1/admin/control-plane/reliability/idempotency?key=${encodeURIComponent(key)}`)
      .set(auth(superToken));
    expect(lookup.status).toBe(200);
    expect(lookup.body.data).toHaveLength(1);
    expect(JSON.stringify(lookup.body)).not.toMatch(/password|otp|secret/i);

    metrics.increment('payment_failure_total');
    expect(metrics.snapshot()['payment_failure_total']).toBeGreaterThanOrEqual(1);
  });

  it('private object store rejects path traversal and missing objects safely', async () => {
    const store = new LocalPrivateObjectStore(join(process.cwd(), 'var', 'private-objects-s33'));
    const stored = await store.put({
      bytes: Buffer.from('s33-private'),
      contentType: 'text/plain',
      prefix: 's33',
    });
    const got = await store.get(stored.key);
    expect(got.bytes.toString('utf8')).toBe('s33-private');
    await expect(store.get('../secrets/x')).rejects.toThrow('invalid_object_key');
    await expect(store.get(`s33/${uuidv7().replace(/-/g, '')}`)).rejects.toThrow('object_not_found');
  });

  it('isolated backup/restore drill succeeds and detects restore failure', async () => {
    const script = join(process.cwd(), 'scripts', 'db-recovery-drill.mjs');
    expect(existsSync(script)).toBe(true);
    const result = spawnSync(process.execPath, [script], {
      env: {
        ...process.env,
        DATABASE_URL: process.env['DATABASE_URL'],
        DRILL_PROVE_FAILURE: 'yes',
        BACKUP_DIR: join(process.cwd(), 'var', 'backups', 's33-e2e'),
      },
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    if (result.status !== 0) {
      // eslint-disable-next-line no-console
      console.error(result.stdout, result.stderr);
    }
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/recovery_drill_restore_failure_detected/);
    expect(result.stdout).toMatch(/recovery_drill_complete/);
    expect(result.stdout).toMatch(/NOT_YET_DEFINED/);
  });
});

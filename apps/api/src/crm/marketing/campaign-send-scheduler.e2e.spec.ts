import { INestApplication } from '@nestjs/common';
import { CrmCampaignStatus, OutboxStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../../app/app.module';
import { PrismaService } from '../../app/prisma.service';
import { ProblemFilter } from '../../common/problem.filter';
import { PolicyCache } from '../../policy/cache';
import { EventWorkerService } from '../../events/worker.service';
import { applyTestIsolation } from '../../test/isolate-runtime';
import { enableCrmPack } from '../../test/enable-crm-pack';
import {
  CRM_CAMPAIGN_SCHEDULED_SEND_SCAN_EVENT,
  campaignSendScanOccurrenceKey,
  isCampaignSendSchedulerEnabled,
} from './campaign-send-scheduler.config';
import { CampaignSendSchedulerService } from './campaign-send-scheduler.service';

async function signIn(
  app: INestApplication,
  email: string,
  audience: 'admin' | 'customer' = 'customer',
) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

async function grantRole(prisma: PrismaService, personId: string, roleCode: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId,
      roleId: role.id,
      scope: 'platform',
      status: 'ACTIVE',
    },
  });
}

describe('R12-B campaign send scheduler (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let scheduler: CampaignSendSchedulerService;
  let eventWorker: EventWorkerService;
  let countryId: string;

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    delete process.env['CRM_CAMPAIGN_SEND_SCHEDULER_ENABLED'];
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    if (!process.env['REDIS_URL']) {
      throw new Error('REDIS_URL is required');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);
    scheduler = app.get(CampaignSendSchedulerService);
    eventWorker = app.get(EventWorkerService);
    await enableCrmPack(prisma, 'XX', app.get(PolicyCache));
    countryId = (await prisma.country.findUniqueOrThrow({ where: { isoAlpha2: 'XX' } })).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  async function createScheduledCampaign(input: {
    suffix: string;
    customerPersonId: string;
    scheduledAt: Date;
    title?: string;
    body?: string;
  }) {
    const agentEmail = `cmp-sched-agent-${input.suffix}@example.com`;
    const agentSeed = await signIn(app, agentEmail);
    await grantRole(prisma, agentSeed.personId, 'company_operations');
    const agent = await signIn(app, agentEmail, 'admin');

    const segment = await request(app.getHttpServer())
      .post('/api/v1/admin/marketing/segments')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({
        country_code: 'XX',
        code: `seg-${input.suffix}`,
        name: 'Scheduler target',
        rules: { type: 'person_ids', person_ids: [input.customerPersonId] },
        status: 'ACTIVE',
      });
    expect(segment.status).toBe(201);

    const campaign = await request(app.getHttpServer())
      .post('/api/v1/admin/marketing/campaigns')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({
        country_code: 'XX',
        code: `cmp-${input.suffix}`,
        name: 'Scheduler promo',
        segment_id: segment.body.id,
        title: input.title ?? 'Scheduled hello',
        body: input.body ?? 'Operational campaign update',
        channel: 'IN_APP',
      });
    expect(campaign.status).toBe(201);

    const scheduled = await request(app.getHttpServer())
      .post(`/api/v1/admin/marketing/campaigns/${campaign.body.id}/schedule`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX', scheduled_at: input.scheduledAt.toISOString() });
    expect(scheduled.status).toBe(201);
    expect(scheduled.body.status).toBe(CrmCampaignStatus.SCHEDULED);

    return { campaignId: campaign.body.id as string, agentToken: agent.token };
  }

  it('is fail-closed by default (scheduler env flag off)', () => {
    expect(isCampaignSendSchedulerEnabled()).toBe(false);
  });

  it('automatically sends a due SCHEDULED campaign without manual admin POST', async () => {
    const suffix = Date.now().toString(36);
    const scanAt = new Date(Date.UTC(2097, 5, 15, 12, 0, 0));
    const customer = await signIn(app, `cmp-sched-cust-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    const { campaignId } = await createScheduledCampaign({
      suffix,
      customerPersonId: customer.personId,
      scheduledAt: new Date(scanAt.getTime() - 60_000),
    });

    const outcome = await scheduler.tickOnce(scanAt);
    expect(outcome.status).toBe('completed');
    expect(outcome.campaigns_processed).toBeGreaterThanOrEqual(1);

    const row = await prisma.crmCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(row.status).toBe(CrmCampaignStatus.COMPLETED);

    const inbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(inbox.status).toBe(200);
    const messages = inbox.body.data ?? inbox.body;
    expect(messages.some((entry: { title: string }) => entry.title === 'Scheduled hello')).toBe(true);

    const outbox = await prisma.outboxEvent.findFirst({
      where: {
        type: CRM_CAMPAIGN_SCHEDULED_SEND_SCAN_EVENT,
        occurrenceKey: campaignSendScanOccurrenceKey(scanAt),
      },
    });
    expect(outbox?.status).toBe(OutboxStatus.PUBLISHED);
  });

  it('does not send a campaign scheduled in the future', async () => {
    const suffix = Date.now().toString(36);
    const scanAt = new Date(Date.UTC(2097, 5, 16, 12, 0, 0));
    const customer = await signIn(app, `cmp-sched-future-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    const { campaignId } = await createScheduledCampaign({
      suffix,
      customerPersonId: customer.personId,
      scheduledAt: new Date(scanAt.getTime() + 86_400_000),
    });

    await scheduler.tickOnce(scanAt);

    const row = await prisma.crmCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(row.status).toBe(CrmCampaignStatus.SCHEDULED);

    const inbox = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${customer.token}`);
    const messages = inbox.body.data ?? inbox.body;
    expect(messages.some((entry: { reference_id?: string }) => entry.reference_id === campaignId)).toBe(
      false,
    );
  });

  it('skips duplicate scheduler ticks for the same scan minute (idempotent replay)', async () => {
    const scanAt = new Date(Date.UTC(2097, 5, 17, 12, 0, 0));
    const completed = await scheduler.tickOnce(scanAt);
    expect(completed.status).toBe('completed');

    const skipped = await scheduler.tickOnce(scanAt);
    expect(skipped.status).toBe('skipped');
    expect(skipped.reason).toBe('already_completed');
  });

  it('does not duplicate campaign sends when scan outbox event is replayed', async () => {
    const suffix = Date.now().toString(36);
    const scanAt = new Date(Date.UTC(2097, 5, 18, 12, 0, 0));
    const customer = await signIn(app, `cmp-sched-replay-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    const { campaignId } = await createScheduledCampaign({
      suffix,
      customerPersonId: customer.personId,
      scheduledAt: new Date(scanAt.getTime() - 60_000),
    });

    const outcome = await scheduler.tickOnce(scanAt);
    expect(outcome.status).toBe('completed');
    expect(outcome.event_id).toBeTruthy();

    const sendsAfterFirst = await prisma.crmCampaignSend.count({ where: { campaignId } });
    expect(sendsAfterFirst).toBe(1);

    await eventWorker.handle(outcome.event_id!);

    const sendsAfterReplay = await prisma.crmCampaignSend.count({ where: { campaignId } });
    expect(sendsAfterReplay).toBe(1);
  });

  it('enforces marketing consent on scheduled sends', async () => {
    const suffix = Date.now().toString(36);
    const scanAt = new Date(Date.UTC(2097, 5, 19, 12, 0, 0));
    const customer = await signIn(app, `cmp-sched-consent-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });

    const { campaignId } = await createScheduledCampaign({
      suffix,
      customerPersonId: customer.personId,
      scheduledAt: new Date(scanAt.getTime() - 60_000),
    });

    await scheduler.tickOnce(scanAt);

    const row = await prisma.crmCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    expect(row.status).toBe(CrmCampaignStatus.COMPLETED);

    const sends = await prisma.crmCampaignSend.findMany({ where: { campaignId } });
    expect(sends.every((entry) => entry.status === 'SKIPPED')).toBe(true);
  });

  it('manual admin send still works alongside scheduler kernel', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `cmp-sched-manual-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    const { campaignId, agentToken } = await createScheduledCampaign({
      suffix,
      customerPersonId: customer.personId,
      scheduledAt: new Date(Date.now() - 60_000),
    });

    const manual = await request(app.getHttpServer())
      .post(`/api/v1/admin/marketing/campaigns/${campaignId}/send`)
      .set('Authorization', `Bearer ${agentToken}`)
      .set('Idempotency-Key', `manual-${suffix}`)
      .send({ country_code: 'XX' });
    expect(manual.status).toBe(201);
    expect(manual.body.sent_count).toBe(1);
  });
});

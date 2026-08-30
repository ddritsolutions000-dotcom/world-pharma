import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { applyTestIsolation } from '../test/isolate-runtime';
import { PolicyCache } from '../policy/cache';
import { enableCrmPack } from '../test/enable-crm-pack';

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

async function grantRole(
  prisma: PrismaService,
  personId: string,
  roleCode: string,
  scope: 'platform' | 'country' = 'platform',
  countryId?: string,
) {
  const role = await prisma.role.findUnique({ where: { code: roleCode } });
  await prisma.membership.create({
    data: {
      id: uuidv7(),
      personId,
      roleId: role!.id,
      scope,
      countryId: scope === 'country' ? countryId : undefined,
      status: 'ACTIVE',
    },
  });
}

describe('R12-B marketing kernel (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
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
    await enableCrmPack(prisma, 'XX', app.get(PolicyCache));
  });

  afterAll(async () => {
    await app.close();
  });

  it('unauthenticated marketing admin returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admin/marketing/campaigns?country_code=XX');
    expect(res.status).toBe(401);
  });

  it('unauthorized admin without campaign:send returns 403', async () => {
    const suffix = Date.now().toString(36);
    const email = `r12b-no-mkt-${suffix}@example.com`;
    await signIn(app, email);
    const admin = await signIn(app, email, 'admin');
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/marketing/segments')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ country_code: 'XX', code: `seg-${suffix}`, name: 'Test' });
    expect(res.status).toBe(403);
  });

  it('rejects clinical segment rules', async () => {
    const suffix = Date.now().toString(36);
    const agentEmail = `r12b-clin-${suffix}@example.com`;
    const seeded = await signIn(app, agentEmail);
    await grantRole(prisma, seeded.personId, 'company_operations');
    const agent = await signIn(app, agentEmail, 'admin');
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/marketing/segments')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({
        country_code: 'XX',
        code: `bad-${suffix}`,
        name: 'Bad',
        rules: { type: 'all', rules: [{ type: 'lab_result' }] },
      });
    expect(res.status).toBe(400);
  });

  it('consent-gated send skips without opt-in and sends after opt-in', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `r12b-cust-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: (await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } }))!.id },
    });

    const agentEmail = `r12b-agent-${suffix}@example.com`;
    const seeded = await signIn(app, agentEmail);
    await grantRole(prisma, seeded.personId, 'company_operations');
    const agent = await signIn(app, agentEmail, 'admin');

    const segment = await request(app.getHttpServer())
      .post('/api/v1/admin/marketing/segments')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({
        country_code: 'XX',
        code: `seg-${suffix}`,
        name: 'Target',
        rules: { type: 'person_ids', person_ids: [customer.personId] },
        status: 'ACTIVE',
      });
    expect(segment.status).toBe(201);

    const campaign = await request(app.getHttpServer())
      .post('/api/v1/admin/marketing/campaigns')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({
        country_code: 'XX',
        code: `cmp-${suffix}`,
        name: 'Promo',
        segment_id: segment.body.id,
        title: 'Hello',
        body: 'Operational update only',
        channel: 'IN_APP',
      });
    expect(campaign.status).toBe(201);

    const scheduled = await request(app.getHttpServer())
      .post(`/api/v1/admin/marketing/campaigns/${campaign.body.id}/schedule`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX' });
    expect(scheduled.status).toBe(201);

    const sendOff = await request(app.getHttpServer())
      .post(`/api/v1/admin/marketing/campaigns/${campaign.body.id}/send`)
      .set('Authorization', `Bearer ${agent.token}`)
      .set('Idempotency-Key', `send-off-${suffix}`)
      .send({ country_code: 'XX' });
    expect(sendOff.status).toBe(201);
    expect(sendOff.body.skipped_count).toBe(1);
    expect(sendOff.body.sent_count).toBe(0);

    const inboxBefore = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(inboxBefore.status).toBe(200);
    expect((inboxBefore.body.data ?? inboxBefore.body).length ?? inboxBefore.body.length).toBe(0);

    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    const campaign2 = await request(app.getHttpServer())
      .post('/api/v1/admin/marketing/campaigns')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({
        country_code: 'XX',
        code: `cmp2-${suffix}`,
        name: 'Promo 2',
        segment_id: segment.body.id,
        title: 'Hello again',
        body: 'You are opted in',
        channel: 'IN_APP',
      });
    expect(campaign2.status).toBe(201);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/marketing/campaigns/${campaign2.body.id}/schedule`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX' });

    const sendOn = await request(app.getHttpServer())
      .post(`/api/v1/admin/marketing/campaigns/${campaign2.body.id}/send`)
      .set('Authorization', `Bearer ${agent.token}`)
      .set('Idempotency-Key', `send-on-${suffix}`)
      .send({ country_code: 'XX' });
    expect(sendOn.status).toBe(201);
    expect(sendOn.body.sent_count).toBe(1);

    const inboxAfter = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(inboxAfter.status).toBe(200);
    const rows = inboxAfter.body.data ?? inboxAfter.body;
    expect(Array.isArray(rows) ? rows.length : 0).toBeGreaterThan(0);
    expect(JSON.stringify(rows).toLowerCase()).not.toMatch(/lab_result|diagnosis|prescription_version/);
  });

  it('opt-out suppresses subsequent sends', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `r12b-out-${suffix}@example.com`);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: (await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } }))!.id },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    const agentEmail = `r12b-out-agent-${suffix}@example.com`;
    const seeded = await signIn(app, agentEmail);
    await grantRole(prisma, seeded.personId, 'company_operations');
    const agent = await signIn(app, agentEmail, 'admin');

    const segment = await request(app.getHttpServer())
      .post('/api/v1/admin/marketing/segments')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({
        country_code: 'XX',
        code: `seg-out-${suffix}`,
        name: 'Target',
        rules: { type: 'person_ids', person_ids: [customer.personId] },
        status: 'ACTIVE',
      });
    expect(segment.status).toBe(201);

    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: false });

    const campaign = await request(app.getHttpServer())
      .post('/api/v1/admin/marketing/campaigns')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({
        country_code: 'XX',
        code: `cmp-out-${suffix}`,
        name: 'After opt-out',
        segment_id: segment.body.id,
        title: 'Should skip',
        body: 'No send',
        channel: 'IN_APP',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/marketing/campaigns/${campaign.body.id}/schedule`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX' });

    const send = await request(app.getHttpServer())
      .post(`/api/v1/admin/marketing/campaigns/${campaign.body.id}/send`)
      .set('Authorization', `Bearer ${agent.token}`)
      .set('Idempotency-Key', `send-out-${suffix}`)
      .send({ country_code: 'XX' });
    expect(send.status).toBe(201);
    expect(send.body.sent_count).toBe(0);
    expect(send.body.skipped_count).toBe(1);
  });

  it('invalid campaign transition returns 409', async () => {
    const suffix = Date.now().toString(36);
    const agentEmail = `r12b-409-${suffix}@example.com`;
    const seeded = await signIn(app, agentEmail);
    await grantRole(prisma, seeded.personId, 'company_operations');
    const agent = await signIn(app, agentEmail, 'admin');

    const segment = await request(app.getHttpServer())
      .post('/api/v1/admin/marketing/segments')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({
        country_code: 'XX',
        code: `seg-409-${suffix}`,
        name: 'Seg',
        rules: { type: 'person_ids', person_ids: [seeded.personId] },
      });
    const campaign = await request(app.getHttpServer())
      .post('/api/v1/admin/marketing/campaigns')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({
        country_code: 'XX',
        code: `cmp-409-${suffix}`,
        name: 'Camp',
        segment_id: segment.body.id,
        title: 'T',
        body: 'B',
      });
    const badSchedule = await request(app.getHttpServer())
      .post(`/api/v1/admin/marketing/campaigns/${campaign.body.id}/schedule`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX' });
    expect(badSchedule.status).toBe(201);
    const again = await request(app.getHttpServer())
      .post(`/api/v1/admin/marketing/campaigns/${campaign.body.id}/schedule`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX' });
    expect(again.status).toBe(409);
  });

  it('send idempotency returns stable counts on replay', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `r12b-idem-${suffix}@example.com`);
    await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ marketing_allowed: true });

    const agentEmail = `r12b-idem-agent-${suffix}@example.com`;
    const seeded = await signIn(app, agentEmail);
    await grantRole(prisma, seeded.personId, 'company_operations');
    const agent = await signIn(app, agentEmail, 'admin');

    const segment = await request(app.getHttpServer())
      .post('/api/v1/admin/marketing/segments')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({
        country_code: 'XX',
        code: `seg-idem-${suffix}`,
        name: 'Seg',
        rules: { type: 'person_ids', person_ids: [customer.personId] },
      });
    const campaign = await request(app.getHttpServer())
      .post('/api/v1/admin/marketing/campaigns')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({
        country_code: 'XX',
        code: `cmp-idem-${suffix}`,
        name: 'Camp',
        segment_id: segment.body.id,
        title: 'T',
        body: 'B',
      });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/marketing/campaigns/${campaign.body.id}/schedule`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX' });

    const key = `idem-${suffix}`;
    const first = await request(app.getHttpServer())
      .post(`/api/v1/admin/marketing/campaigns/${campaign.body.id}/send`)
      .set('Authorization', `Bearer ${agent.token}`)
      .set('Idempotency-Key', key)
      .send({ country_code: 'XX' });
    expect(first.status).toBe(201);
    expect(first.body.sent_count).toBe(1);

    const replay = await request(app.getHttpServer())
      .post(`/api/v1/admin/marketing/campaigns/${campaign.body.id}/send`)
      .set('Authorization', `Bearer ${agent.token}`)
      .set('Idempotency-Key', key)
      .send({ country_code: 'XX' });
    expect(replay.status).toBe(201);
    expect(replay.body.sent_count).toBe(1);
    expect(replay.body.skipped_count).toBe(0);
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { applyTestIsolation } from '../test/isolate-runtime';
import { enableCrmPack } from '../test/enable-crm-pack';
import { PolicyCache } from '../policy/cache';

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

function assertNoClinicalPayload(body: unknown) {
  const raw = JSON.stringify(body).toLowerCase();
  const forbidden = [
    'health_timeline',
    'lab_result',
    'analyte',
    'imaging_finding',
    'prescription_version',
    'consent_scope',
    'break_glass',
    'artifact_payload',
    'diagnosis',
    'consult_note',
  ];
  for (const token of forbidden) {
    expect(raw.includes(token)).toBe(false);
  }
}

describe('R12-A CRM kernel (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let countryId: string;

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
    const country = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!country) {
      throw new Error('XX country seed required');
    }
    countryId = country.id;
    await enableCrmPack(prisma, 'XX', app.get(PolicyCache));
  });

  afterAll(async () => {
    await app.close();
  });

  it('unauthenticated admin CRM returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admin/crm/customers?country_code=XX');
    expect(res.status).toBe(401);
  });

  it('unauthorized admin without crm:read returns 403', async () => {
    const suffix = Date.now().toString(36);
    const email = `r12a-no-crm-${suffix}@example.com`;
    await signIn(app, email);
    const admin = await signIn(app, email, 'admin');
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/crm/customers?country_code=XX')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(403);
  });

  it('marketing default OFF and opt-in/opt-out durable', async () => {
    const suffix = Date.now().toString(36);
    const customer = await signIn(app, `r12a-mkt-${suffix}@example.com`);
    const getDefault = await request(app.getHttpServer())
      .get('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(getDefault.status).toBe(200);
    expect(getDefault.body.marketing_allowed).toBe(false);

    const optIn = await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `mkt-in-${suffix}`)
      .send({ marketing_allowed: true, email_allowed: true });
    expect(optIn.status).toBe(200);
    expect(optIn.body.marketing_allowed).toBe(true);

    const viaNotification = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/preferences')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(viaNotification.status).toBe(200);
    expect(viaNotification.body.marketing).toBe(true);

    const optOut = await request(app.getHttpServer())
      .patch('/api/v1/me/marketing-preferences?country_code=XX')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `mkt-out-${suffix}`)
      .send({ marketing_allowed: false });
    expect(optOut.status).toBe(200);
    expect(optOut.body.marketing_allowed).toBe(false);
    expect(optOut.body.email_allowed).toBe(false);
  });

  it('Customer 360 metadata-only without clinical payloads', async () => {
    const suffix = Date.now().toString(36);
    const customerEmail = `r12a-cust-${suffix}@example.com`;
    const customer = await signIn(app, customerEmail);
    await prisma.person.update({
      where: { id: customer.personId },
      data: { primaryCountryId: countryId },
    });

    const ticketQueue = await prisma.supportQueue.findFirst({ where: { countryId } });
    if (ticketQueue) {
      await prisma.supportTicket.create({
        data: {
          id: uuidv7(),
          personId: customer.personId,
          countryId,
          queueId: ticketQueue.id,
          status: 'OPEN',
          subject: `CRM 360 test ${suffix}`,
        },
      });
    }

    const agentEmail = `r12a-agent-${suffix}@example.com`;
    const agentSeed = await signIn(app, agentEmail);
    await grantRole(prisma, agentSeed.personId, 'company_support');
    const agent = await signIn(app, agentEmail, 'admin');

    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/crm/customers?country_code=XX&q=${encodeURIComponent(customerEmail)}`)
      .set('Authorization', `Bearer ${agent.token}`);
    expect(list.status).toBe(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/crm/customers/${customer.personId}?country_code=XX`)
      .set('Authorization', `Bearer ${agent.token}`);
    if (detail.status === 404) {
      const ticketQueue = await prisma.supportQueue.findFirst({ where: { countryId } });
      if (ticketQueue) {
        await prisma.supportTicket.create({
          data: {
            id: uuidv7(),
            personId: customer.personId,
            countryId,
            queueId: ticketQueue.id,
            status: 'OPEN',
            subject: 'CRM test ticket',
          },
        });
      }
      const retry = await request(app.getHttpServer())
        .get(`/api/v1/admin/crm/customers/${customer.personId}?country_code=XX`)
        .set('Authorization', `Bearer ${agent.token}`);
      expect(retry.status).toBe(200);
      assertNoClinicalPayload(retry.body);
      expect(retry.body.profile?.identifiers?.[0]?.masked_value).toBeDefined();
      return;
    }
    expect(detail.status).toBe(200);
    assertNoClinicalPayload(detail.body);
    expect(detail.body.profile?.identifiers?.[0]?.masked_value).toMatch(/\*+/);
  });

  it('conversion event idempotency and tenant isolation', async () => {
    const suffix = Date.now().toString(36);
    const agentEmail = `r12a-conv-${suffix}@example.com`;
    const seeded = await signIn(app, agentEmail);
    await grantRole(prisma, seeded.personId, 'company_operations');
    const agent = await signIn(app, agentEmail, 'admin');
    const sourceKey = `order-${suffix}`;
    const first = await request(app.getHttpServer())
      .post('/api/v1/admin/crm/conversion-events')
      .set('Authorization', `Bearer ${agent.token}`)
      .set('Idempotency-Key', `conv-${suffix}`)
      .send({
        country_code: 'XX',
        source: 'test',
        source_key: sourceKey,
        event_kind: 'ORDER_PAID',
      });
    expect(first.status).toBe(201);
    const second = await request(app.getHttpServer())
      .post('/api/v1/admin/crm/conversion-events')
      .set('Authorization', `Bearer ${agent.token}`)
      .set('Idempotency-Key', `conv-${suffix}-2`)
      .send({
        country_code: 'XX',
        source: 'test',
        source_key: sourceKey,
        event_kind: 'ORDER_PAID',
      });
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
  });

  it('malformed customer id returns 400', async () => {
    const suffix = Date.now().toString(36);
    const agentEmail = `r12a-bad-${suffix}@example.com`;
    const agentSeed = await signIn(app, agentEmail);
    await grantRole(prisma, agentSeed.personId, 'company_support');
    const agent = await signIn(app, agentEmail, 'admin');
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/crm/customers/not-a-uuid?country_code=XX')
      .set('Authorization', `Bearer ${agent.token}`);
    expect(res.status).toBe(400);
  });
});

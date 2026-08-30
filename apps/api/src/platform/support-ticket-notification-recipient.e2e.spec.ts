import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { EventWorkerService } from '../events/worker.service';
import { applyTestIsolation } from '../test/isolate-runtime';

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

describe('CR-321 support ticket notification recipient parity (e2e)', () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let eventWorker: EventWorkerService;
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
    eventWorker = app.get(EventWorkerService);
    const country = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!country) {
      throw new Error('XX country seed required');
    }
    countryId = country.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function inboxTitles(token: string) {
    const res = await request(app.getHttpServer())
      .get('/api/v1/me/notifications/inbox')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const rows = res.body.data ?? res.body;
    return rows.map((row: { title: string }) => row.title as string);
  }

  it('notifies ticket owner (not agent) on agent reply and admin status transitions', async () => {
    const suffix = `${Date.now().toString(36)}-${uuidv7().slice(0, 8)}`;
    const customer = await signIn(app, `cr321-cust-${suffix}@example.com`);
    const otherCustomer = await signIn(app, `cr321-other-${suffix}@example.com`);
    const agentEmail = `cr321-agent-${suffix}@example.com`;
    const agentSeed = await signIn(app, agentEmail);
    await grantRole(prisma, agentSeed.personId, 'company_support', 'country', countryId);
    const agent = await signIn(app, agentEmail, 'admin');

    const created = await request(app.getHttpServer())
      .post('/api/v1/support/tickets')
      .set('Authorization', `Bearer ${customer.token}`)
      .set('Idempotency-Key', `ticket-${suffix}`)
      .send({
        country_code: 'XX',
        subject: 'Delivery question',
        body: 'Where is my package?',
      });
    expect(created.status).toBe(201);
    const ticketId = created.body.id as string;

    const assigned = await request(app.getHttpServer())
      .post(`/api/v1/admin/support/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ assignee_person_id: agentSeed.personId, country_code: 'XX' });
    expect(assigned.status).toBe(201);

    const assignedEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'SUPPORT_TICKET_ASSIGNED', aggregateId: ticketId },
      orderBy: { createdAt: 'desc' },
    });
    expect(assignedEvent?.payload).toMatchObject({
      person_id: customer.personId,
      actor_person_id: agentSeed.personId,
    });
    expect(assignedEvent?.actorId).toBeNull();

    const reply = await request(app.getHttpServer())
      .post(`/api/v1/admin/support/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({
        country_code: 'XX',
        visibility: 'CUSTOMER',
        body: 'We are checking with logistics.',
      });
    expect(reply.status).toBe(201);

    const replyEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'SUPPORT_TICKET_AGENT_REPLY', aggregateId: ticketId },
      orderBy: { createdAt: 'desc' },
    });
    expect(replyEvent?.payload).toMatchObject({
      person_id: customer.personId,
      actor_person_id: agentSeed.personId,
    });
    expect(replyEvent?.actorId).toBeNull();

    const resolved = await request(app.getHttpServer())
      .post(`/api/v1/admin/support/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX', status: 'RESOLVED' });
    expect(resolved.status).toBe(201);

    const resolvedEvent = await prisma.outboxEvent.findFirst({
      where: { type: 'SUPPORT_TICKET_RESOLVED', aggregateId: ticketId },
      orderBy: { createdAt: 'desc' },
    });
    expect(resolvedEvent?.payload).toMatchObject({
      person_id: customer.personId,
      actor_person_id: agentSeed.personId,
    });
    expect(resolvedEvent?.actorId).toBeNull();

    await eventWorker.handle(replyEvent!.id);
    await eventWorker.handle(replyEvent!.id);
    await eventWorker.handle(resolvedEvent!.id);
    await eventWorker.handle(resolvedEvent!.id);

    const customerTitles = await inboxTitles(customer.token);
    expect(customerTitles.filter((title: string) => title === 'Support team replied').length).toBe(1);
    expect(customerTitles.filter((title: string) => title === 'Support ticket resolved').length).toBe(1);
    expect(await inboxTitles(agent.token)).not.toContain('Support team replied');
    expect(await inboxTitles(agent.token)).not.toContain('Support ticket resolved');
    expect(await inboxTitles(otherCustomer.token)).not.toContain('Support team replied');
    expect(await inboxTitles(otherCustomer.token)).not.toContain('Support ticket resolved');
  });
});

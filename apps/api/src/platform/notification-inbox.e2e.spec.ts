import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { applyTestIsolation } from '../test/isolate-runtime';
import { NotificationService } from './notification.service';

async function signIn(app: INestApplication, email: string, audience: 'customer' | 'doctor' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function genericItem(id: string, title: string) {
  return {
    id,
    channel: 'in_app' as const,
    title,
    body: 'Open the app for details. External channels remain disabled in sandbox.',
    read: false,
    created_at: new Date().toISOString(),
    reference_type: 'order' as const,
    reference_id: uuidv7(),
  };
}

describe('M-CUS-NOTIF in-app inbox mark-read and isolation (e2e)', () => {
  jest.setTimeout(120_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let notifications: NotificationService;

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
    notifications = app.get(NotificationService);
    const country = await prisma.country.findUnique({ where: { isoAlpha2: 'XX' } });
    if (!country) {
      throw new Error('XX country seed required');
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated inbox access', async () => {
    const inbox = await request(app.getHttpServer()).get('/api/v1/me/notifications/inbox');
    expect(inbox.status).toBe(401);
    const mark = await request(app.getHttpServer()).post(`/api/v1/me/notifications/inbox/${uuidv7()}/read`);
    expect(mark.status).toBe(401);
  });

  it('keeps customer inboxes person-scoped and supports mark-read', async () => {
    const customerA = await signIn(app, `inbox-a-${uuidv7()}@example.test`);
    const customerB = await signIn(app, `inbox-b-${uuidv7()}@example.test`);
    const itemId = uuidv7();
    await notifications.enqueueInbox(customerA.personId, genericItem(itemId, 'Order confirmed'));

    const own = await request(app.getHttpServer()).get('/api/v1/me/notifications/inbox').set(auth(customerA.token));
    expect(own.status).toBe(200);
    expect(own.body.data.some((row: { id: string; title: string }) => row.id === itemId && row.title === 'Order confirmed')).toBe(
      true,
    );
    expect(JSON.stringify(own.body)).not.toMatch(/diagnosis|lab result|prescription strength/i);

    const other = await request(app.getHttpServer()).get('/api/v1/me/notifications/inbox').set(auth(customerB.token));
    expect(other.status).toBe(200);
    expect(other.body.data.some((row: { id: string }) => row.id === itemId)).toBe(false);

    const steal = await request(app.getHttpServer())
      .post(`/api/v1/me/notifications/inbox/${itemId}/read`)
      .set(auth(customerB.token));
    expect(steal.status).toBe(404);

    const marked = await request(app.getHttpServer())
      .post(`/api/v1/me/notifications/inbox/${itemId}/read`)
      .set(auth(customerA.token));
    expect(marked.status).toBe(200);
    expect(marked.body.data.find((row: { id: string }) => row.id === itemId)?.read).toBe(true);

    const again = await request(app.getHttpServer()).get('/api/v1/me/notifications/inbox').set(auth(customerA.token));
    expect(again.body.data.find((row: { id: string }) => row.id === itemId)?.read).toBe(true);
    expect(again.body.data.find((row: { id: string }) => row.id === itemId)?.title).toBe('Order confirmed');
  });

  it('does not expose a customer inbox to a doctor token', async () => {
    const customer = await signIn(app, `inbox-c-${uuidv7()}@example.test`);
    const doctor = await signIn(app, `inbox-d-${uuidv7()}@example.test`, 'doctor');
    const itemId = uuidv7();
    await notifications.enqueueInbox(customer.personId, genericItem(itemId, 'Appointment confirmed'));

    const doctorInbox = await request(app.getHttpServer()).get('/api/v1/me/notifications/inbox').set(auth(doctor.token));
    expect(doctorInbox.status).toBe(200);
    expect(doctorInbox.body.data.some((row: { id: string }) => row.id === itemId)).toBe(false);

    const steal = await request(app.getHttpServer())
      .post(`/api/v1/me/notifications/inbox/${itemId}/read`)
      .set(auth(doctor.token));
    expect(steal.status).toBe(404);

    const doctorItemId = uuidv7();
    await notifications.enqueueInbox(doctor.personId, genericItem(doctorItemId, 'Video consult ready'));
    const own = await request(app.getHttpServer()).get('/api/v1/me/notifications/inbox').set(auth(doctor.token));
    expect(own.body.data.some((row: { id: string; title: string }) => row.id === doctorItemId && row.title === 'Video consult ready')).toBe(
      true,
    );
  });
});

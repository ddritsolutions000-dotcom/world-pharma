import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
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

describe('R11-A CMS + support kernel (e2e)', () => {
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('unauthenticated admin CMS returns 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admin/cms/content?country_code=XX');
    expect(res.status).toBe(401);
  });

  it('CMS lifecycle: draft → review → publish → archive with public read isolation', async () => {
    const suffix = `${Date.now().toString(36)}`;
    const editorEmail = `r11a-editor-${suffix}@example.com`;
    const publisherEmail = `r11a-publisher-${suffix}@example.com`;
    const editorSeed = await signIn(app, editorEmail);
    await grantRole(prisma, editorSeed.personId, 'company_operations');
    const editor = await signIn(app, editorEmail, 'admin');
    const publisherSeed = await signIn(app, publisherEmail);
    await grantRole(prisma, publisherSeed.personId, 'company_compliance');
    const publisher = await signIn(app, publisherEmail, 'admin');

    const slug = `r11a-article-${suffix}`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/cms/content')
      .set('Authorization', `Bearer ${editor.token}`)
      .send({
        country_code: 'XX',
        content_type: 'ARTICLE',
        slug,
        title: 'R11A Test Article',
        body: 'Published help content without PHI.',
        category_slug: 'getting-started',
      });
    expect(created.status).toBe(201);
    const contentId = created.body.id as string;

    const draftPublic = await request(app.getHttpServer()).get(
      `/api/v1/help/articles/${slug}?country_code=XX`,
    );
    expect(draftPublic.status).toBe(404);

    const submitted = await request(app.getHttpServer())
      .post(`/api/v1/admin/cms/content/${contentId}/submit-review`)
      .set('Authorization', `Bearer ${editor.token}`)
      .send({ country_code: 'XX' });
    expect(submitted.status).toBe(201);
    expect(submitted.body.status).toBe('IN_REVIEW');

    const unauthorizedPublish = await request(app.getHttpServer())
      .post(`/api/v1/admin/cms/content/${contentId}/publish`)
      .set('Authorization', `Bearer ${editor.token}`)
      .send({ country_code: 'XX' });
    expect(unauthorizedPublish.status).toBe(403);

    const published = await request(app.getHttpServer())
      .post(`/api/v1/admin/cms/content/${contentId}/publish`)
      .set('Authorization', `Bearer ${publisher.token}`)
      .set('Idempotency-Key', `pub-${suffix}`)
      .send({ country_code: 'XX' });
    expect(published.status).toBe(201);
    expect(published.body.status).toBe('PUBLISHED');

    const pubRepeat = await request(app.getHttpServer())
      .post(`/api/v1/admin/cms/content/${contentId}/publish`)
      .set('Authorization', `Bearer ${publisher.token}`)
      .set('Idempotency-Key', `pub-${suffix}`)
      .send({ country_code: 'XX' });
    expect(pubRepeat.status).toBe(201);
    expect(pubRepeat.body.id).toBe(contentId);

    const publicRead = await request(app.getHttpServer()).get(
      `/api/v1/help/articles/${slug}?country_code=XX`,
    );
    expect(publicRead.status).toBe(200);
    expect(publicRead.body.title).toBe('R11A Test Article');

    const archived = await request(app.getHttpServer())
      .post(`/api/v1/admin/cms/content/${contentId}/archive`)
      .set('Authorization', `Bearer ${publisher.token}`)
      .send({ country_code: 'XX' });
    expect(archived.status).toBe(201);
    expect(archived.body.status).toBe('ARCHIVED');

    const afterArchive = await request(app.getHttpServer()).get(
      `/api/v1/help/articles/${slug}?country_code=XX`,
    );
    expect(afterArchive.status).toBe(404);

    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const asset = await request(app.getHttpServer())
      .post('/api/v1/admin/cms/assets')
      .set('Authorization', `Bearer ${editor.token}`)
      .send({
        country_code: 'XX',
        content_item_id: contentId,
        content_base64: pngBase64,
        content_type: 'image/png',
        original_name: 'pixel.png',
      });
    expect(asset.status).toBe(201);
    expect(asset.body.asset_id).toBeTruthy();
    expect(asset.body.content_type).toBe('image/png');
    expect(JSON.stringify(asset.body)).not.toMatch(/var[/\\]private/i);
  });

  it('support ticket lifecycle with customer/agent isolation and internal notes', async () => {
    const suffix = `${Date.now().toString(36)}`;
    const customerA = await signIn(app, `r11a-cust-a-${suffix}@example.com`);
    const customerB = await signIn(app, `r11a-cust-b-${suffix}@example.com`);
    const agentEmail = `r11a-agent-${suffix}@example.com`;
    const agentSeed = await signIn(app, agentEmail);
    await grantRole(prisma, agentSeed.personId, 'company_support', 'country', countryId);
    const agent = await signIn(app, agentEmail, 'admin');

    const created = await request(app.getHttpServer())
      .post('/api/v1/support/tickets')
      .set('Authorization', `Bearer ${customerA.token}`)
      .set('Idempotency-Key', `ticket-${suffix}`)
      .send({
        country_code: 'XX',
        subject: 'Order question',
        body: 'Where is my order?',
      });
    expect(created.status).toBe(201);
    const ticketId = created.body.id as string;

    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/support/tickets')
      .set('Authorization', `Bearer ${customerA.token}`)
      .set('Idempotency-Key', `ticket-${suffix}`)
      .send({
        country_code: 'XX',
        subject: 'Order question',
        body: 'Where is my order?',
      });
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.id).toBe(ticketId);

    const crossCustomer = await request(app.getHttpServer())
      .get(`/api/v1/support/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${customerB.token}`);
    expect([403, 404]).toContain(crossCustomer.status);

    const assigned = await request(app.getHttpServer())
      .post(`/api/v1/admin/support/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ assignee_person_id: agentSeed.personId, country_code: 'XX' });
    expect(assigned.status).toBe(201);
    expect(assigned.body.status).toBe('ASSIGNED');

    const internalNote = await request(app.getHttpServer())
      .post(`/api/v1/admin/support/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({
        country_code: 'XX',
        visibility: 'INTERNAL',
        body: 'Internal: check logistics only',
      });
    expect(internalNote.status).toBe(201);
    expect(internalNote.body.messages.some((m: { visibility: string }) => m.visibility === 'INTERNAL')).toBe(
      true,
    );

    const customerView = await request(app.getHttpServer())
      .get(`/api/v1/support/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${customerA.token}`);
    expect(customerView.status).toBe(200);
    expect(
      customerView.body.messages.every((m: { body: string }) => !m.body.includes('Internal:')),
    ).toBe(true);

    const resolved = await request(app.getHttpServer())
      .post(`/api/v1/admin/support/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX', status: 'IN_PROGRESS' });
    expect(resolved.status).toBe(201);

    const closed = await request(app.getHttpServer())
      .post(`/api/v1/admin/support/tickets/${ticketId}/status`)
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ country_code: 'XX', status: 'CLOSED' });
    expect(closed.status).toBe(201);
    expect(closed.body.status).toBe('CLOSED');

    const postCloseMessage = await request(app.getHttpServer())
      .post(`/api/v1/support/tickets/${ticketId}/messages`)
      .set('Authorization', `Bearer ${customerA.token}`)
      .send({ body: 'One more thing' });
    expect(postCloseMessage.status).toBe(409);
  });

  it('help search returns published content only', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/help/search?country_code=XX&q=R11A',
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

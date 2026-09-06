import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomToken, sha256Hex, uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { AdminStaffService } from './admin-staff.service';
import { applyTestIsolation } from '../test/isolate-runtime';

async function signInCustomer(app: INestApplication, email: string) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  expect(requested.status).toBe(200);
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience: 'customer',
    });
  expect(verified.status).toBe(200);
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

async function signInAdmin(app: INestApplication, email: string, personId: string) {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'LOGIN' });
  expect(requested.status).toBe(200);
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
      audience: 'admin',
    });
  expect(verified.status).toBe(200);
  return { token: verified.body.access_token as string, personId: personId || (verified.body.person_id as string) };
}

describe('Phase 4B-1 authorization hardening (e2e)', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let staff: AdminStaffService;

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
    staff = app.get(AdminStaffService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function attachRole(personId: string, roleCode: string) {
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    await prisma.membership.create({
      data: {
        id: uuidv7(),
        personId,
        roleId: role!.id,
        scope: 'platform',
        status: 'ACTIVE',
      },
    });
  }

  async function provisionAdmin(email: string, roleCode: string) {
    const customer = await signInCustomer(app, email);
    await attachRole(customer.personId, roleCode);
    return signInAdmin(app, email, customer.personId);
  }

  it('denies governance and security-events without required permissions', async () => {
    const limited = await provisionAdmin(`limited-${Date.now()}@example.com`, 'company_support');
    const auth = { Authorization: `Bearer ${limited.token}` };

    const governance = await request(app.getHttpServer()).get('/api/v1/admin/governance/regions').set(auth);
    expect(governance.status).toBe(403);

    const audit = await request(app.getHttpServer()).get('/api/v1/admin/security-events').set(auth);
    expect(audit.status).toBe(403);
  });

  it('allows authorized super admin to read governance and security events', async () => {
    const admin = await provisionAdmin(`super-${Date.now()}@example.com`, 'super_admin');
    const auth = { Authorization: `Bearer ${admin.token}` };

    const governance = await request(app.getHttpServer()).get('/api/v1/admin/governance/regions').set(auth);
    expect(governance.status).toBe(200);

    const audit = await request(app.getHttpServer()).get('/api/v1/admin/security-events').set(auth);
    expect(audit.status).toBe(200);
  });

  it('protects lab admin endpoints with lab:review', async () => {
    const limited = await provisionAdmin(`lab-limited-${Date.now()}@example.com`, 'company_support');
    const denied = await request(app.getHttpServer())
      .get('/api/v1/admin/labs')
      .set({ Authorization: `Bearer ${limited.token}` });
    expect(denied.status).toBe(403);

    const reviewer = await provisionAdmin(`lab-reviewer-${Date.now()}@example.com`, 'company_operations');
    const allowed = await request(app.getHttpServer())
      .get('/api/v1/admin/labs')
      .set({ Authorization: `Bearer ${reviewer.token}` });
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.labs)).toBe(true);
  });

  it('rejects break-glass requests with unknown permissions', async () => {
    const security = await provisionAdmin(`sec-${Date.now()}@example.com`, 'company_security');
    const target = await signInCustomer(app, `target-${Date.now()}@example.com`);
    const bad = await request(app.getHttpServer())
      .post('/api/v1/admin/company-authority/break-glass')
      .set({ Authorization: `Bearer ${security.token}` })
      .send({
        target_person_id: target.personId,
        reason: 'incident',
        permissions: ['totally:fake'],
        ttl_minutes: 10,
      });
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });

  it('elevated admin invitation cannot bypass dual-control', async () => {
    const inviter = await provisionAdmin(`inviter-${Date.now()}@example.com`, 'super_admin');
    const inviteeEmail = `invitee-${Date.now()}@example.com`;
    const country = await prisma.country.findFirst({ orderBy: { createdAt: 'asc' } });
    const rawToken = randomToken(32);
    await prisma.partnerInvitation.create({
      data: {
        id: uuidv7(),
        tokenHash: sha256Hex(rawToken),
        kind: 'ADMIN',
        status: 'PENDING',
        countryId: country!.id,
        intendedRoleCode: 'super_admin',
        invitedEmail: inviteeEmail,
        invitedById: inviter.personId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    const accepted = await staff.acceptInvitation({
      token: rawToken,
      identifier: inviteeEmail,
    });
    expect(accepted.status).toBe('PENDING');
    expect(accepted.request_id).toBeTruthy();
    const membership = await prisma.membership.findFirst({
      where: {
        person: { identifiers: { some: { type: 'EMAIL', valueNormalized: inviteeEmail } } },
        role: { code: 'super_admin' },
        status: 'ACTIVE',
      },
    });
    expect(membership).toBeNull();
  });
});

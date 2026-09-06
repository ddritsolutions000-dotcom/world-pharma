import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { uuidv7 } from '@world-pharma/shared';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { ProblemFilter } from '../common/problem.filter';
import { applyTestIsolation } from '../test/isolate-runtime';
import { assertHumanGatesAllowLive } from './r14a-gate';
import { assertLiveProductionPrerequisites } from './payment.config';

async function signIn(app: INestApplication, email: string, audience: 'admin' | 'customer' = 'customer') {
  const requested = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ identifier: email, purpose: 'REGISTER' });
  const verified = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code, audience });
  return { token: verified.body.access_token as string, personId: verified.body.person_id as string };
}

describe('R14-A human gate configuration (dev placeholders)', () => {
  jest.setTimeout(120_000);

  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let adminPersonId: string;
  let customerToken: string;

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    delete process.env['PAYMENT_ENVIRONMENT'];
    delete process.env['PAYMENT_LIVE_ENABLED'];
    if (!process.env['REDIS_URL']) {
      throw new Error('REDIS_URL is required');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
    prisma = app.get(PrismaService);

    const admin = await signIn(app, `r14a-gate-admin-${Date.now()}@example.com`, 'admin');
    adminToken = admin.token;
    adminPersonId = admin.personId;
    const role = await prisma.role.findUnique({ where: { code: 'company_finance' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: admin.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    const customer = await signIn(app, `r14a-gate-cust-${Date.now()}@example.com`, 'customer');
    customerToken = customer.token;
  });

  afterAll(async () => {
    await prisma.r14AHumanGate.update({
      where: { gateCode: 'NAMED_PSP' },
      data: {
        valueText: 'DEV_PLACEHOLDER_PSP',
        evidenceClass: 'PLACEHOLDER',
        evidenceRef: 'DEV_PLACEHOLDER_NOT_BOOK_263_EVIDENCE',
        updatedByPersonId: null,
        verifiedByPersonId: null,
        verifiedAt: null,
      },
    });
    await app.close();
  });

  it('lists seven placeholder gates as engineering-config-ready, not live-ready', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/payments/r14a-gates')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.engineering_config_status).toBe('R14_A_ENGINEERING_CONFIG_READY');
    expect(res.body.readiness_status).toBe('R14_A_READINESS_INCOMPLETE');
    expect(res.body.next_required_action).toBe('HUMAN_GATE_COLLECTION_REQUIRED');
    expect(res.body.live_production_status).toBe('R14_A_LIVE_PRODUCTION_BLOCKED');
    expect(res.body.book_263_production_evidence).toBe('NOT_CLAIMED');
    expect(res.body.live_payment_enabled).toBe(false);
    expect(res.body.owner_evidenced_count).toBe(0);
    expect(res.body.gates).toHaveLength(7);
    expect(res.body.gates.every((g: { placeholder: boolean }) => g.placeholder)).toBe(true);
    expect(res.body.gates.map((g: { value: string }) => g.value)).toEqual(
      expect.arrayContaining([
        'DEV_PLACEHOLDER_PSP',
        'ZZ',
        'DEV_PLACEHOLDER_ENTITY',
        'DEV_PLACEHOLDER_MOR',
        'DEV_PLACEHOLDER_CONTRACT',
        'DEV_PLACEHOLDER_VAULT_PATH',
        'DEV_PLACEHOLDER_SAQ',
      ]),
    );
  });

  it('rejects customer access and secret-like values', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/payments/r14a-gates')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .put('/api/v1/admin/payments/r14a-gates/NAMED_PSP')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'sk_live_not_a_real_key' })
      .expect(400);
  });

  it('records an auditable placeholder update and still blocks verify/live', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/admin/payments/r14a-gates/NAMED_PSP')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'DEV_PLACEHOLDER_PSP_UPDATED' })
      .expect(200);
    const revisions = await request(app.getHttpServer())
      .get('/api/v1/admin/payments/r14a-gates/NAMED_PSP/revisions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(revisions.body.data[0].actor_person_id).toBe(adminPersonId);
    expect(revisions.body.data[0].action).toBe('UPSERT');
    const verify = await request(app.getHttpServer())
      .post('/api/v1/admin/payments/r14a-gates/NAMED_PSP/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ evidence_ref: 'GATE-PSP-001' })
      .expect(409);
    expect(verify.body.code).toBe('PLACEHOLDER_NOT_OWNER_EVIDENCE');
    process.env['PAYMENT_LIVE_ENABLED'] = 'true';
    try {
      const rows = await prisma.r14AHumanGate.findMany();
      expect(() =>
        assertHumanGatesAllowLive(
          rows.map((row) => ({
            gateCode: row.gateCode,
            valueText: row.valueText,
            evidenceClass: row.evidenceClass,
            evidenceRef: row.evidenceRef,
            updatedByPersonId: row.updatedByPersonId,
            verifiedByPersonId: row.verifiedByPersonId,
            verifiedAt: row.verifiedAt,
            updatedAt: row.updatedAt,
          })),
          'e2e',
        ),
      ).toThrow();
      expect(() =>
        assertLiveProductionPrerequisites('e2e', {
          gatewayCode: 'STRIPE_LIVE',
          countryIso2: 'US',
          humanGates: rows.map((row) => ({
            gateCode: row.gateCode,
            valueText: row.valueText,
            evidenceClass: row.evidenceClass,
            evidenceRef: row.evidenceRef,
            updatedByPersonId: row.updatedByPersonId,
            verifiedByPersonId: row.verifiedByPersonId,
            verifiedAt: row.verifiedAt,
            updatedAt: row.updatedAt,
          })),
        }),
      ).toThrow();
    } finally {
      delete process.env['PAYMENT_LIVE_ENABLED'];
    }
  });

  it('records pending owner evidence, enforces dual control, and still blocks live', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/admin/payments/r14a-gates/NAMED_PSP')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: '%PDF-1.4', evidence_ref: 'CONTRACT-1' })
      .expect(400);
    const pending = await request(app.getHttpServer())
      .put('/api/v1/admin/payments/r14a-gates/NAMED_PSP')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'OWNER_SUPPLIED_VENDOR_NAME', evidence_ref: 'GATE-PSP-OWNER-REF-001' })
      .expect(200);
    const named = pending.body.gates.find((g: { gate_code: string }) => g.gate_code === 'NAMED_PSP');
    expect(named.workflow_status).toBe('PENDING');
    expect(named.evidence_class).toBe('PLACEHOLDER');
    expect(named.placeholder).toBe(false);
    expect(named.updated_by_person_id).toBe(adminPersonId);
    expect(pending.body.readiness_status).toBe('R14_A_READINESS_INCOMPLETE');
    expect(pending.body.live_production_status).toBe('R14_A_LIVE_PRODUCTION_BLOCKED');

    const sameActor = await request(app.getHttpServer())
      .post('/api/v1/admin/payments/r14a-gates/NAMED_PSP/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ evidence_ref: 'GATE-PSP-OWNER-REF-001' })
      .expect(409);
    expect(sameActor.body.code).toBe('DUAL_CONTROL_REQUIRED');

    const reviewer = await signIn(app, `r14a-gate-reviewer-${Date.now()}@example.com`, 'admin');
    const role = await prisma.role.findUnique({ where: { code: 'company_finance' } });
    await prisma.membership.create({
      data: { id: uuidv7(), personId: reviewer.personId, roleId: role!.id, scope: 'platform', status: 'ACTIVE' },
    });
    const verified = await request(app.getHttpServer())
      .post('/api/v1/admin/payments/r14a-gates/NAMED_PSP/verify')
      .set('Authorization', `Bearer ${reviewer.token}`)
      .send({ evidence_ref: 'GATE-PSP-OWNER-REF-001' })
      .expect(200);
    const verifiedGate = verified.body.gates.find((g: { gate_code: string }) => g.gate_code === 'NAMED_PSP');
    expect(verifiedGate.workflow_status).toBe('OWNER_EVIDENCED');
    expect(verifiedGate.evidence_class).toBe('OWNER_EVIDENCED');
    expect(verifiedGate.verified_by_person_id).toBe(reviewer.personId);
    expect(verified.body.owner_evidenced_count).toBe(1);
    expect(verified.body.readiness_status).toBe('R14_A_READINESS_INCOMPLETE');
    expect(verified.body.next_required_action).toBe('HUMAN_GATE_COLLECTION_REQUIRED');
    expect(verified.body.live_production_status).toBe('R14_A_LIVE_PRODUCTION_BLOCKED');
    expect(verified.body.book_263_production_evidence).toBe('NOT_CLAIMED');

    const audit = await prisma.securityEvent.findFirst({
      where: { type: 'R14A_GATE_UPDATED', personId: reviewer.personId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.outcome).toBe('success');
    expect((audit?.metadata as { action?: string } | null)?.action).toBe('VERIFY');

    process.env['PAYMENT_LIVE_ENABLED'] = 'true';
    try {
      const rows = await prisma.r14AHumanGate.findMany();
      expect(() =>
        assertLiveProductionPrerequisites('e2e-pending-live', {
          gatewayCode: 'STRIPE_LIVE',
          countryIso2: 'US',
          humanGates: rows.map((row) => ({
            gateCode: row.gateCode,
            valueText: row.valueText,
            evidenceClass: row.evidenceClass,
            evidenceRef: row.evidenceRef,
            updatedByPersonId: row.updatedByPersonId,
            verifiedByPersonId: row.verifiedByPersonId,
            verifiedAt: row.verifiedAt,
            updatedAt: row.updatedAt,
          })),
        }),
      ).toThrow();
    } finally {
      delete process.env['PAYMENT_LIVE_ENABLED'];
    }
  });
});

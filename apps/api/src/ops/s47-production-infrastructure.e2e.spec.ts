/**
 * Sprint 47 — Production infrastructure software boundary (e2e)
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { PrismaService } from '../app/prisma.service';
import { configureApi } from '../common/http-setup';
import { parseEnv } from '@world-pharma/config';
import { applyTestIsolation } from '../test/isolate-runtime';
import { provisionSuperAdmin } from '../test/sign-in';
import { LocalPrivateObjectStore } from '../partner/object-store';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';

describe('Sprint 47 production infrastructure (e2e)', () => {
  jest.setTimeout(180_000);
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    applyTestIsolation();
    process.env['NODE_ENV'] = 'test';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] = process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    process.env['CORS_ALLOWED_ORIGINS'] = process.env['CORS_ALLOWED_ORIGINS'] ?? 'http://localhost:3000';
    if (!process.env['REDIS_URL']) throw new Error('REDIS_URL is required');
    const env = parseEnv();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApi(app, env);
    await app.init();
    prisma = app.get(PrismaService);
    const admin = await provisionSuperAdmin(app, prisma, 's47-admin');
    adminToken = admin.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('health ready includes safe infrastructure categories', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.postgres).toBe('up');
    expect(res.body.redis).toBe('up');
    expect(res.body.database.connectivity).toBe('up');
    expect(res.body.infrastructure.pitr).toBe('EXTERNAL_GATED');
    expect(res.body.infrastructure.rpo).toBe('TARGET_DEFINED');
    expect(res.body.infrastructure.rto).toBe('TARGET_DEFINED');
    expect(res.body.infrastructure.recovery_infrastructure_status).toBe(
      'RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED',
    );

  it('echoes correlation id', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('x-correlation-id', 's47-corr-health');
    expect(res.headers['x-correlation-id']).toBe('s47-corr-health');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('admin reliability snapshot never leaks secrets', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/control-plane/reliability/snapshot')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.never_expose_secrets).toBe(true);
    expect(res.body.production_config.never_expose_secrets).toBe(true);
    expect(res.body.infrastructure.storage).toBe('EXTERNAL_GATED');
    expect(res.body.backup_catalog.pitr).toBe('EXTERNAL_GATED');
    const blob = JSON.stringify(res.body);
    expect(blob).not.toContain('postgresql://');
    expect(blob).not.toContain(process.env['JWT_ACCESS_SECRET']);
    expect(blob).not.toContain(process.env['OTP_PEPPER']);
    expect(res.body.operational_signals.some((s: { code: string }) => s.code === 'DLQ_GROWTH')).toBe(true);
  });

  it('sandbox private object put/get remains functional', async () => {
    const root = join(tmpdir(), `s47-e2e-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    const store = new LocalPrivateObjectStore(root);
    const put = await store.put({
      bytes: Buffer.from('pod-photo'),
      contentType: 'image/jpeg',
      prefix: 'delivery-pod/ship-1',
    });
    const got = await store.get(put.key);
    expect(got.bytes.toString()).toBe('pod-photo');
    rmSync(root, { recursive: true, force: true });
  });

  it('unauthenticated reliability snapshot is blocked', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admin/control-plane/reliability/snapshot');
    expect(res.status).toBe(401);
  });
});

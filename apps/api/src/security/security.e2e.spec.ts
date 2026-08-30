import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { parseEnv } from '@world-pharma/config';
import { AppModule } from '../app/app.module';
import { configureApi } from '../common/http-setup';
import { redactText } from '../common/redact';
import { applyTestIsolation } from '../test/isolate-runtime';

describe('security foundation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    applyTestIsolation();
    if (!process.env['REDIS_URL']) {
      throw new Error('REDIS_URL is required');
    }
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    process.env['CORS_ALLOWED_ORIGINS'] = 'http://localhost:3000';
    const env = parseEnv();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApi(app, env);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets security headers and echoes correlation ids', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('x-correlation-id', 'corr-test-1');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['permissions-policy']).toMatch(/camera=\(\)/);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['x-correlation-id']).toBe('corr-test-1');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('applies explicit CORS allowlist', async () => {
    const ok = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:3000');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const denied = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects unexpected fields and oversized JSON', async () => {
    const extra = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ identifier: 'user@example.com', extra: true });
    expect(extra.status).toBe(400);
    const huge = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .set('content-type', 'application/json')
      .send(`{"identifier":"${'a'.repeat(200_000)}@example.com"}`);
    expect(huge.status).toBeGreaterThanOrEqual(400);
  });

  it('denies unauthenticated protected routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/me');
    expect(res.status).toBe(401);
  });

  it('rate-limits OTP request bursts', async () => {
    const identifier = `sec.${Date.now()}@example.com`;
    let limited = false;
    for (let i = 0; i < 12; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ identifier });
      if (res.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it('does not leak secrets in redacted logs', () => {
    const leaked = redactText(
      'otp=654321 password=hunter2 token=eyJhbGci refresh=rt_secret mfa=JBSWY3DPEHPK3PXP cvv=123 pan=4111111111111111',
    );
    expect(leaked).not.toMatch(/654321/);
    expect(leaked).not.toMatch(/eyJhbGci/);
    expect(leaked).not.toMatch(/hunter2/);
    expect(leaked).not.toMatch(/rt_secret/);
    expect(leaked).not.toMatch(/JBSWY3DPEHPK3PXP/);
    expect(leaked).not.toMatch(/4111111111111111/);
  });

  it('reports readiness against live postgres and redis', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ready', postgres: 'up', redis: 'up' });
  });

  it('exposes metrics without high-cardinality labels', async () => {
    await request(app.getHttpServer()).get('/health');
    const res = await request(app.getHttpServer()).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/http_requests_total/);
    expect(res.text).not.toMatch(/@example.com/);
  });
});

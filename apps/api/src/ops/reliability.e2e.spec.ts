import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { parseEnv } from '@world-pharma/config';
import { AppModule } from '../app/app.module';
import { configureApi } from '../common/http-setup';
import { redactText } from '../common/redact';
import { applyTestIsolation } from '../test/isolate-runtime';

describe('reliability foundation (e2e)', () => {
  jest.setTimeout(120_000);
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

  it('liveness does not probe dependencies', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('readiness reports postgres, redis, outbox and runtime profile', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.postgres).toBe('up');
    expect(res.body.redis).toBe('up');
    expect(res.body.outbox).toMatchObject({
      pending: expect.any(Number),
      processing: expect.any(Number),
      dead_lettered: expect.any(Number),
    });
    expect(res.body.runtime.dependencies.some((d: { name: string }) => d.name === 'payments')).toBe(
      true,
    );
    expect(res.body.runtime.dependencies.find((d: { name: string }) => d.name === 'payments')?.mode).toBe(
      'sandbox',
    );
  });

  it('returns problem+json with request and correlation ids on validation error', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .set('x-correlation-id', 'reliability-corr-1')
      .send({ unexpected: true });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/problem\+json/);
    expect(res.body.code).toBeDefined();
    expect(res.headers['x-correlation-id']).toBe('reliability-corr-1');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body.correlation_id).toBe('reliability-corr-1');
    expect(res.body.request_id).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/password|otp=|token=/i);
  });

  it('returns 401 problem envelope for protected routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('rate-limits OTP and returns Retry-After on 429', async () => {
    const identifier = `reliability.${Date.now()}@example.com`;
    let limited = false;
    for (let i = 0; i < 15; i += 1) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ identifier });
      if (res.status === 429) {
        limited = true;
        expect(res.headers['retry-after']).toBeDefined();
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
        expect(res.body.retry_after_seconds).toBeGreaterThan(0);
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it('redacts sensitive substrings from log helper', () => {
    const raw = 'user token=abc123 otp=654321';
    expect(redactText(raw)).not.toContain('abc123');
    expect(redactText(raw)).toContain('[redacted]');
  });

  it('exposes in-process metrics without high-cardinality labels', async () => {
    await request(app.getHttpServer()).get('/health');
    const metrics = await request(app.getHttpServer()).get('/metrics');
    expect(metrics.status).toBe(200);
    expect(metrics.text).toMatch(/http_requests_total/);
    expect(metrics.text).not.toMatch(/userId|email|phone/);
  });
});

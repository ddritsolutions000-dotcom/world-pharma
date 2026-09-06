import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { ProblemFilter } from '../common/problem.filter';
import { configureApi } from '../common/http-setup';
import { parseEnv } from '@world-pharma/config';
import { applyTestIsolation } from '../test/isolate-runtime';

describe('identity security hardening (e2e)', () => {
  let app: INestApplication;

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
    const redis = new Redis(process.env['REDIS_URL']);
    await redis.flushdb();
    redis.disconnect();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApi(app, parseEnv());
    app.useGlobalFilters(new ProblemFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects admin audience for non-company accounts', async () => {
    const adminEmail = `sec-admin-deny.${Date.now()}@example.com`;
    const requested = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ identifier: adminEmail, purpose: 'REGISTER' });
    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({
        challenge_id: requested.body.challenge_id,
        code: requested.body.dev_code,
        audience: 'admin',
      });
    expect(verified.status).toBe(403);
  });

  it('sets httpOnly cookies and serves bootstrap', async () => {
    const email = `sec-admin-cookie.${Date.now()}@example.com`;
    const requested = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ identifier: email, purpose: 'REGISTER' });
    const agent = request.agent(app.getHttpServer());
    const verified = await agent
      .post('/api/v1/auth/otp/verify')
      .send({
        challenge_id: requested.body.challenge_id,
        code: requested.body.dev_code,
        audience: 'customer',
      });
    expect(verified.status).toBe(200);
    expect(verified.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('wp_at='), expect.stringContaining('wp_rt=')]),
    );
    const bootstrap = await agent.get('/api/v1/auth/bootstrap');
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.body.authenticated).toBe(true);
    expect(bootstrap.body.person_id).toBe(verified.body.person_id);
  });

  it('rejects bootstrap after logout', async () => {
    const requested = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ identifier: `logout.${Date.now()}@example.com`, purpose: 'REGISTER' });
    const agent = request.agent(app.getHttpServer());
    const verified = await agent.post('/api/v1/auth/otp/verify').send({
      challenge_id: requested.body.challenge_id,
      code: requested.body.dev_code,
    });
    expect(verified.status).toBe(200);
    const logout = await agent.post('/api/v1/auth/logout');
    expect(logout.status).toBe(200);
    const bootstrap = await agent.get('/api/v1/auth/bootstrap');
    expect(bootstrap.status).toBe(401);
  });
});

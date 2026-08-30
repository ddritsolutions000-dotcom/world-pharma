import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../app/app.module';
import { ProblemFilter } from '../common/problem.filter';
import { applyTestIsolation } from '../test/isolate-runtime';

describe('identity kernel (e2e)', () => {
  let app: INestApplication;
  const identifier = `task2.${Date.now()}@example.com`;

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
    app.useGlobalFilters(new ProblemFilter());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requests, verifies, reads me, refreshes, and logs out', async () => {
    const requested = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ identifier, purpose: 'REGISTER' });
    expect([200, 201]).toContain(requested.status);
    expect(requested.body.challenge_id).toBeDefined();
    expect(requested.body.dev_code).toMatch(/^\d{6}$/);
    expect(JSON.stringify(requested.body)).not.toContain('password');

    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code });
    expect(verified.status).toBe(200);
    expect(verified.body.access_token).toBeDefined();
    expect(verified.body.refresh_token).toBeDefined();

    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${verified.body.access_token}`);
    expect(me.status).toBe(200);
    expect(me.body.person_id).toBe(verified.body.person_id);
    expect(me.body).not.toHaveProperty('password_hash');

    const reused = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ challenge_id: requested.body.challenge_id, code: requested.body.dev_code });
    expect(reused.status).toBeGreaterThanOrEqual(400);

    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/token/refresh')
      .send({ refresh_token: verified.body.refresh_token });
    expect(rotated.status).toBe(200);
    expect(rotated.body.refresh_token).not.toBe(verified.body.refresh_token);

    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${rotated.body.access_token}`);
    expect(logout.status).toBe(200);

    const afterLogout = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${rotated.body.access_token}`);
    expect(afterLogout.status).toBe(401);

    const reuseRefresh = await request(app.getHttpServer())
      .post('/api/v1/auth/token/refresh')
      .send({ refresh_token: verified.body.refresh_token });
    expect(reuseRefresh.status).toBe(401);
  });

  it('rejects missing bearer on /me', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/me');
    expect(response.status).toBe(401);
  });
});

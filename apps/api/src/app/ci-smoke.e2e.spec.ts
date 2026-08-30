import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { parseEnv } from '@world-pharma/config';
import { configureApi } from '../common/http-setup';
import { AppModule } from './app.module';
import { applyTestIsolation } from '../test/isolate-runtime';

describe('CI smoke (foundation, not product)', () => {
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
    process.env['APP_VERSION'] = '0.0.0-test';
    process.env['GIT_SHA'] = 'test-sha';
    const env = parseEnv();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApi(app, env);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves liveness and version metadata without secrets', async () => {
    const live = await request(app.getHttpServer()).get('/health');
    expect(live.status).toBe(200);
    expect(live.body).toEqual({ status: 'ok' });
    const version = await request(app.getHttpServer()).get('/health/version');
    expect(version.status).toBe(200);
    expect(version.body.git_sha).toBe('test-sha');
    expect(JSON.stringify(version.body)).not.toMatch(/secret|pepper|password/i);
  });

  it('readiness reports postgres and Redis 7', async () => {
    const ready = await request(app.getHttpServer()).get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.postgres).toBe('up');
    expect(ready.body.redis).toBe('up');
    expect(ready.body.redis_version).toMatch(/^7\./);
  });

  it('identity is authenticated, policy is public, partner admin stays dark', async () => {
    const me = await request(app.getHttpServer()).get('/api/v1/me');
    expect(me.status).toBe(401);
    const countries = await request(app.getHttpServer()).get('/api/v1/countries');
    expect(countries.status).toBe(200);
    const partners = await request(app.getHttpServer()).post('/api/v1/admin/partners/applications').send({});
    expect(partners.status).toBe(401);
  });
});

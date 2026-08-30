import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './app.module';
import { applyTestIsolation } from '../test/isolate-runtime';

describe('GET /health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['PORT'] = '4000';
    applyTestIsolation();
    if (!process.env['REDIS_URL']) {
      throw new Error('REDIS_URL is required');
    }
    process.env['JWT_ACCESS_SECRET'] =
      process.env['JWT_ACCESS_SECRET'] ?? 'test-access-secret-must-be-32-chars-min';
    process.env['OTP_PEPPER'] =
      process.env['OTP_PEPPER'] ?? 'test-otp-pepper-must-be-32-chars-minx';
    process.env['AUTH_DEV_REVEAL_OTP'] = 'true';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'health/ready'] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 and { status: ok }', async () => {
    const response = await request(app.getHttpServer()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('reports postgres/redis/bullmq on /health/ready', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.postgres).toBe('up');
    expect(response.body.redis).toBe('up');
    expect(response.body.redis_version).toMatch(/^7\./);
  });
});

import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { OutboxDispatcherService } from '../events/dispatcher.service';
import { probeRedis } from '../events/redis-support';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';

jest.mock('../events/redis-support', () => ({
  probeRedis: jest.fn(),
}));

const probe = probeRedis as jest.MockedFunction<typeof probeRedis>;

function mockRes(): Response {
  return { status: jest.fn().mockReturnThis() } as unknown as Response;
}

describe('HealthController', () => {
  async function controller(prisma: object, dispatcher: object): Promise<HealthController> {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: OutboxDispatcherService, useValue: dispatcher },
      ],
    }).compile();
    return moduleRef.get(HealthController);
  }

  it('returns ok without checking dependencies', async () => {
    const health = await controller({ $queryRaw: async () => [1] }, { isActive: () => false });
    expect(health.health()).toEqual({ status: 'ok' });
    expect(health.version().status).toBe('ok');
    expect(health.version().git_sha).toBeDefined();
  });

  it('reports ready when postgres and redis are up', async () => {
    probe.mockResolvedValue({ ok: true, version: '7.4.9', bullMqCompatible: true });
    const health = await controller({ $queryRaw: async () => [1] }, { isActive: () => true });
    const res = mockRes();
    await expect(health.ready(res)).resolves.toMatchObject({
      status: 'ready',
      postgres: 'up',
      redis: 'up',
      bullmq: 'up',
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 503 when postgres is unavailable', async () => {
    probe.mockResolvedValue({ ok: true, version: '7.4.9', bullMqCompatible: true });
    const health = await controller(
      {
        $queryRaw: async () => {
          throw new Error('ECONNREFUSED');
        },
      },
      { isActive: () => true },
    );
    const res = mockRes();
    await expect(health.ready(res)).resolves.toMatchObject({
      status: 'not_ready',
      postgres: 'down',
    });
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('returns 503 when redis is unavailable', async () => {
    probe.mockResolvedValue({
      ok: false,
      version: null,
      bullMqCompatible: false,
      error: 'ECONNREFUSED',
    });
    const health = await controller({ $queryRaw: async () => [1] }, { isActive: () => false });
    const res = mockRes();
    await expect(health.ready(res)).resolves.toMatchObject({
      status: 'not_ready',
      redis: 'down',
      bullmq: 'down',
    });
    expect(res.status).toHaveBeenCalledWith(503);
  });
});

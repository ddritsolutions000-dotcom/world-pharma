import Redis from 'ioredis';
import { probeRedis } from './redis-support';

describe('probeRedis', () => {
  const previous = process.env['REDIS_URL'];

  afterEach(() => {
    if (previous) {
      process.env['REDIS_URL'] = previous;
    }
  });

  it('reports unavailable when Redis cannot be reached', async () => {
    process.env['REDIS_URL'] = 'redis://127.0.0.1:1';
    const runtime = await probeRedis();
    expect(runtime.ok).toBe(false);
    expect(runtime.bullMqCompatible).toBe(false);
    expect(runtime.error).toBeDefined();
    expect(runtime.error).not.toMatch(/password|token|otp/i);
  });

  it('reports the live Redis version when reachable', async () => {
    const url = previous ?? process.env['REDIS_URL'];
    if (!url) {
      throw new Error('REDIS_URL is required');
    }
    process.env['REDIS_URL'] = url;
    const runtime = await probeRedis();
    expect(runtime.ok).toBe(true);
    expect(runtime.bullMqCompatible).toBe(true);
    const client = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 1500 });
    try {
      const info = await client.info('server');
      const match = /redis_version:(\d+\.\d+\.\d+)/.exec(info);
      expect(runtime.version).toBe(match?.[1] ?? null);
    } finally {
      await client.quit();
    }
  });
});

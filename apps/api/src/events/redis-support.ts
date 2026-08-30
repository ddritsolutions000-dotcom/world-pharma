import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { sanitizeErrorMessage } from './envelope';
import { requireRedisUrl } from './redis-url';

export interface RedisRuntime {
  ok: boolean;
  version: string | null;
  bullMqCompatible: boolean;
  error?: string;
}

export async function probeRedis(): Promise<RedisRuntime> {
  const url = requireRedisUrl();
  const probe = new Redis(url, { maxRetriesPerRequest: 1, connectTimeout: 1500 });
  try {
    const info = await probe.info('server');
    const match = /redis_version:(\d+\.\d+\.\d+)/.exec(info);
    const version = match?.[1] ?? null;
    const major = match ? Number(match[1].split('.')[0]) : 0;
    return {
      ok: true,
      version,
      bullMqCompatible: major >= 5,
    };
  } catch (error) {
    return {
      ok: false,
      version: null,
      bullMqCompatible: false,
      error: sanitizeErrorMessage(error),
    };
  } finally {
    try {
      await probe.quit();
    } catch {
      probe.disconnect();
    }
  }
}

export async function redisMeetsBullMq(logger: Logger): Promise<boolean> {
  const runtime = await probeRedis();
  if (!runtime.ok) {
    logger.error(
      JSON.stringify({
        event: 'bullmq_redis_unavailable',
        error: runtime.error,
      }),
    );
    return false;
  }
  if (!runtime.bullMqCompatible) {
    logger.error(
      JSON.stringify({
        event: 'bullmq_redis_unsupported',
        redis_version: runtime.version,
        hint: 'BullMQ needs Redis 5+. Point REDIS_URL at Compose Redis 7 (mapped REDIS_PORT).',
      }),
    );
    return false;
  }
  return true;
}

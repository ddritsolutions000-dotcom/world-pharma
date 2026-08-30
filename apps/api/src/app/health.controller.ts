import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OutboxDispatcherService } from '../events/dispatcher.service';
import { probeRedis } from '../events/redis-support';
import { PrismaService } from './prisma.service';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: OutboxDispatcherService,
  ) {}

  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('health/version')
  version(): { status: 'ok'; version: string; git_sha: string; built_at: string | null } {
    return {
      status: 'ok',
      version: process.env['APP_VERSION'] ?? '0.0.0',
      git_sha: process.env['GIT_SHA'] ?? 'unknown',
      built_at: process.env['BUILD_TIME'] ?? null,
    };
  }

  @Get('health/ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<{
    status: 'ready' | 'not_ready';
    postgres: 'up' | 'down';
    redis: 'up' | 'down';
    redis_version: string | null;
    bullmq: 'up' | 'down';
  }> {
    let postgres: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      postgres = 'up';
    } catch {
      postgres = 'down';
    }
    const redis = await probeRedis();
    const bullmq: 'up' | 'down' =
      redis.bullMqCompatible && this.dispatcher.isActive() ? 'up' : 'down';
    const ready = postgres === 'up' && redis.ok && redis.bullMqCompatible;
    if (!ready) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return {
      status: ready ? 'ready' : 'not_ready',
      postgres,
      redis: redis.ok ? 'up' : 'down',
      redis_version: redis.version,
      bullmq,
    };
  }
}

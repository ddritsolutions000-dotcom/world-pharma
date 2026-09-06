import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OutboxDispatcherService } from '../events/dispatcher.service';
import { probeRedis } from '../events/redis-support';
import { buildRuntimeProfile } from '../common/runtime-profile';
import { evaluateProductionInfrastructureAvailable } from '../ops/production-infrastructure-gate';
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
  async ready(@Res({ passthrough: true }) res: Response) {
    let postgres: 'up' | 'down' = 'down';
    let migrations: 'ok' | 'unknown' | 'down' = 'unknown';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      postgres = 'up';
      try {
        await this.prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM _prisma_migrations`;
        migrations = 'ok';
      } catch {
        migrations = 'unknown';
      }
    } catch {
      postgres = 'down';
      migrations = 'down';
    }
    const redis = await probeRedis();
    const bullmq: 'up' | 'down' | 'disabled' =
      process.env['NODE_ENV'] === 'test'
        ? 'disabled'
        : redis.bullMqCompatible && this.dispatcher.isActive()
          ? 'up'
          : 'down';
    const [pending, processing, deadLettered] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
      this.prisma.outboxEvent.count({ where: { status: 'PROCESSING' } }),
      this.prisma.outboxEvent.count({ where: { status: 'DEAD_LETTERED' } }),
    ]);
    const ready =
      postgres === 'up' &&
      redis.ok &&
      (process.env['NODE_ENV'] === 'test' || redis.bullMqCompatible);
    if (!ready) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    const infra = evaluateProductionInfrastructureAvailable();
    return {
      status: ready ? 'ready' : 'not_ready',
      postgres,
      redis: redis.ok ? 'up' : 'down',
      redis_version: redis.version,
      bullmq,
      outbox: {
        pending,
        processing,
        dead_lettered: deadLettered,
      },
      database: {
        connectivity: postgres,
        migrations,
      },
      infrastructure: {
        status: infra.status,
        storage: infra.storage,
        malware_scanning: infra.malware_scanning,
        kms_secrets: infra.kms_secrets,
        backups: infra.backups,
        pitr: infra.pitr,
        rpo: infra.rpo,
        rto: infra.rto,
        rpo_target: infra.rpo_target,
        rto_target: infra.rto_target,
        recovery_infrastructure_status: infra.recovery_infrastructure_status,
      },
      runtime: buildRuntimeProfile(),
    };
  }
}

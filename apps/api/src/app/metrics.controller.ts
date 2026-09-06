import { Controller, Get, Header, Headers, UnauthorizedException } from '@nestjs/common';
import { MetricsService } from '../common/metrics.service';
import { probeRedis } from '../events/redis-support';
import { PrismaService } from './prisma.service';

@Controller()
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('metrics')
  @Header('content-type', 'text/plain; version=0.0.4')
  async collect(@Headers('authorization') authorization?: string): Promise<string> {
    const token = process.env['METRICS_TOKEN']?.trim();
    if (token) {
      const presented = authorization?.startsWith('Bearer ') ? authorization.slice(7) : authorization;
      if (presented !== token) {
        throw new UnauthorizedException('Metrics token required.');
      }
    }
    await this.refreshOperationalGauges();
    return this.metricsService.renderPrometheus();
  }

  private async refreshOperationalGauges(): Promise<void> {
    let postgresReady = 0;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      postgresReady = 1;
    } catch {
      postgresReady = 0;
    }
    const redis = await probeRedis();
    const [pending, processing, deadLettered, failed] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
      this.prisma.outboxEvent.count({ where: { status: 'PROCESSING' } }),
      this.prisma.outboxEvent.count({ where: { status: 'DEAD_LETTERED' } }),
      this.prisma.outboxEvent.count({ where: { status: 'FAILED' } }),
    ]);
    const stuckCutoff = new Date(Date.now() - 120_000);
    const stuckProcessing = await this.prisma.outboxEvent.count({
      where: { status: 'PROCESSING', updatedAt: { lt: stuckCutoff } },
    });

    this.metricsService.setGauge('postgres_ready', postgresReady);
    this.metricsService.setGauge('redis_ready', redis.ok ? 1 : 0);
    this.metricsService.setGauge('outbox_pending', pending);
    this.metricsService.setGauge('outbox_processing', processing);
    this.metricsService.setGauge('outbox_dead_lettered', deadLettered);
    this.metricsService.setGauge('outbox_failed', failed);
    this.metricsService.setGauge('outbox_stuck_processing', stuckProcessing);
  }
}

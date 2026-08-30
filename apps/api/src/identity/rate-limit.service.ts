import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from '../app/redis.service';
import { MetricsService } from '../common/metrics.service';

@Injectable()
export class RateLimitService {
  constructor(
    private readonly redis: RedisService,
    private readonly metrics: MetricsService,
  ) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfter: number }> {
    try {
      await this.ensureConnected();
      const redisKey = `rl:${key}`;
      const count = await this.redis.client.incr(redisKey);
      if (count === 1) {
        await this.redis.client.expire(redisKey, windowSeconds);
      }
      const ttl = await this.redis.client.ttl(redisKey);
      const retryAfter = ttl > 0 ? ttl : windowSeconds;
      const allowed = count <= limit;
      if (!allowed) {
        this.metrics.increment('rate_limit_total', { window: String(windowSeconds) });
      }
      return { allowed, retryAfter };
    } catch {
      this.metrics.increment('rate_limit_unavailable_total');
      throw new ServiceUnavailableException({
        type: 'https://worldpharma.example/problems/rate-limit-unavailable',
        title: 'Service unavailable',
        status: 503,
        detail: 'Rate limiter unavailable.',
        code: 'RATE_LIMIT_UNAVAILABLE',
      });
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.redis.client.status === 'wait') {
      await this.redis.client.connect();
    }
  }
}

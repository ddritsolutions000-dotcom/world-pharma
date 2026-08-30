import { ServiceUnavailableException } from '@nestjs/common';
import { MetricsService } from '../common/metrics.service';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  it('fails closed when Redis is unavailable', async () => {
    const redis = {
      client: {
        status: 'wait',
        connect: async () => {
          throw new Error('ECONNREFUSED');
        },
      },
    };
    const metrics = { increment: jest.fn() };
    const limiter = new RateLimitService(
      redis as never,
      metrics as unknown as MetricsService,
    );
    await expect(limiter.hit('otp:ip:1', 5, 60)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(metrics.increment).toHaveBeenCalledWith('rate_limit_unavailable_total');
  });
});

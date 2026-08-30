import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../app/redis.service';
import type { PolicyDocument } from './empty-pack';

export interface CachedPublishedPack {
  packId: string;
  countryId: string;
  isoAlpha2: string;
  version: number;
  document: PolicyDocument;
}

@Injectable()
export class PolicyCache {
  private readonly logger = new Logger(PolicyCache.name);

  constructor(private readonly redis: RedisService) {}

  key(isoAlpha2: string): string {
    return `policy:published:${isoAlpha2}`;
  }

  async read(isoAlpha2: string): Promise<CachedPublishedPack | null> {
    try {
      await this.ensureConnected();
      const raw = await this.redis.client.get(this.key(isoAlpha2));
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as CachedPublishedPack;
    } catch (error) {
      this.logger.warn(`policy cache read failed: ${(error as Error).message}`);
      return null;
    }
  }

  async write(isoAlpha2: string, value: CachedPublishedPack, ttlSeconds = 60): Promise<void> {
    try {
      await this.ensureConnected();
      await this.redis.client.set(this.key(isoAlpha2), JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`policy cache write failed: ${(error as Error).message}`);
    }
  }

  async invalidate(isoAlpha2: string): Promise<void> {
    try {
      await this.ensureConnected();
      await this.redis.client.del(this.key(isoAlpha2));
    } catch (error) {
      this.logger.warn(`policy cache invalidate failed: ${(error as Error).message}`);
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.redis.client.status === 'wait') {
      await this.redis.client.connect();
    }
  }
}

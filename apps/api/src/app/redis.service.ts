import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor() {
    const url = process.env['REDIS_URL'];
    if (!url) {
      throw new Error('REDIS_URL is required');
    }
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      commandTimeout: 1500,
      enableOfflineQueue: false,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.client.removeAllListeners();
    // Never-connected lazy clients: disconnect without quit to avoid leftover sockets.
    if (this.client.status === 'wait') {
      this.client.disconnect();
      return;
    }
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  /** Lazy clients with enableOfflineQueue:false must connect before commands. */
  async ensureConnected(): Promise<void> {
    if (this.client.status === 'wait') {
      await this.client.connect();
    }
  }
}

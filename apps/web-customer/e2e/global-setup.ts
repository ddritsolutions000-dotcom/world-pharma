/**
 * Clears OTP rate-limit keys in Redis before browser runs (local dev only).
 */
async function globalSetup(): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:56379';
  try {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
    await client.connect();
    const keys = await client.keys('rl:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
    await client.quit();
  } catch {
    // Redis optional — API may still serve OTP when limits are not exhausted.
  }
}

export default globalSetup;

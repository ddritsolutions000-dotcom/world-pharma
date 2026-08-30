export function requireRedisUrl(): string {
  const url = process.env['REDIS_URL'];
  if (!url) {
    throw new Error('REDIS_URL is required. Use Compose Redis 7 (see docs/blueprint/44_EVENT_IMPLEMENTATION_NOTES.md).');
  }
  return url;
}

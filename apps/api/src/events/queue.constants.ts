export const DOMAIN_EVENTS_QUEUE = 'domain-events';

/** Optional BullMQ key prefix. Tests set BULLMQ_PREFIX so they never share queues with a live API. */
export function bullmqConnectionOptions<T extends { connection: unknown }>(
  options: T,
): T & { prefix?: string } {
  const prefix = process.env['BULLMQ_PREFIX'];
  if (!prefix) {
    return options;
  }
  return { ...options, prefix };
}

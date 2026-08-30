/** Platform aggregate id for daily analytics rollup outbox events (fixed UUID). */
export const ANALYTICS_ROLLUP_AGGREGATE_ID = '00000000-0000-4000-8000-000000000010';

/** Platform aggregate id for daily CRM/analytics retention purge outbox events (fixed UUID). */
export const ANALYTICS_PURGE_AGGREGATE_ID = '00000000-0000-4000-8000-000000000011';

export const ANALYTICS_DAILY_ROLLUP_EVENT = 'ANALYTICS_DAILY_ROLLUP';

/** Book 223 §11 PersonalizationPurgeWorker — outbox event name for evt.crm.purge. */
export const CRM_PERSONALIZATION_PURGE_EVENT = 'CRM_PERSONALIZATION_PURGE';

export function isAnalyticsRollupSchedulerEnabled(): boolean {
  return process.env['ANALYTICS_ROLLUP_SCHEDULER_ENABLED'] === 'true';
}

export function readAnalyticsRollupSchedulerPollMs(): number {
  const raw = Number(process.env['ANALYTICS_ROLLUP_SCHEDULER_POLL_MS'] ?? 3_600_000);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : 3_600_000;
}

export function rollupOccurrenceKey(metricDateKey: string): string {
  return `daily:${metricDateKey}`;
}

export function purgeOccurrenceKey(runDateKey: string): string {
  return `purge:daily:${runDateKey}`;
}

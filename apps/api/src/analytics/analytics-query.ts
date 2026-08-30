export const ANALYTICS_INGEST_VERSION = 'rollup_v1';

export const ANALYTICS_FEED_KINDS = {
  CONVERSION: 'conversion_events',
  PERSONALIZATION: 'personalization_events',
  MARKETING: 'marketing',
  COOCCURRENCE: 'cooccurrence_rebuild',
} as const;

export type AnalyticsFeedKind = (typeof ANALYTICS_FEED_KINDS)[keyof typeof ANALYTICS_FEED_KINDS];

export function utcDayStart(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

export function utcDayEnd(input: Date): Date {
  return new Date(utcDayStart(input).getTime() + 86_400_000);
}

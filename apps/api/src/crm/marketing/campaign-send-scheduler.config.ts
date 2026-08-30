/** Platform aggregate id for scheduled campaign send scan outbox events (fixed UUID). */
export const CRM_CAMPAIGN_SEND_AGGREGATE_ID = '00000000-0000-4000-8000-000000000013';

/** TD-R12B-02 — scan and send due SCHEDULED campaigns. */
export const CRM_CAMPAIGN_SCHEDULED_SEND_SCAN_EVENT = 'CRM_CAMPAIGN_SCHEDULED_SEND_SCAN';

export function isCampaignSendSchedulerEnabled(): boolean {
  return process.env['CRM_CAMPAIGN_SEND_SCHEDULER_ENABLED'] === 'true';
}

export function readCampaignSendSchedulerPollMs(): number {
  const raw = Number(process.env['CRM_CAMPAIGN_SEND_SCHEDULER_POLL_MS'] ?? 3_600_000);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : 3_600_000;
}

export function campaignSendScanOccurrenceKey(scanAt: Date): string {
  return `campaign_send_scan:${scanAt.toISOString().slice(0, 16)}`;
}

export function schedulerBatchKey(campaignId: string): string {
  return `scheduler:${campaignId}`;
}

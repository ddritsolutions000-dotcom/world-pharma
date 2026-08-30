/** Platform aggregate id for daily CRM automation evaluate outbox events (fixed UUID). */
export const CRM_AUTOMATION_AGGREGATE_ID = '00000000-0000-4000-8000-000000000012';

/** TD-R12G-02 — daily CRM automation evaluation outbox event. */
export const CRM_AUTOMATION_DAILY_EVALUATE_EVENT = 'CRM_AUTOMATION_DAILY_EVALUATE';

export function isCrmAutomationSchedulerEnabled(): boolean {
  return process.env['CRM_AUTOMATION_SCHEDULER_ENABLED'] === 'true';
}

export function readCrmAutomationSchedulerPollMs(): number {
  const raw = Number(process.env['CRM_AUTOMATION_SCHEDULER_POLL_MS'] ?? 3_600_000);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : 3_600_000;
}

export function utcDayStart(input: Date): Date {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

export function automationEvaluateOccurrenceKey(runDateKey: string): string {
  return `crm_automation:daily:${runDateKey}`;
}

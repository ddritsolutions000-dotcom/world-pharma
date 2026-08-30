import { Errors } from '../common/problem';
import { isLiveSettlementImportEnabled, readSettlementEnvironment } from './settlement-import.config';

export function isSettlementImportWorkerEnabled(): boolean {
  return process.env['SETTLEMENT_IMPORT_WORKER_ENABLED'] === 'true';
}

export function readSettlementImportWorkerPollMs(): number {
  const raw = Number(process.env['SETTLEMENT_IMPORT_WORKER_POLL_MS'] ?? 60_000);
  return Number.isFinite(raw) && raw >= 5_000 ? raw : 60_000;
}

export function readSettlementImportWorkerMaxRetries(): number {
  const raw = Number(process.env['SETTLEMENT_IMPORT_WORKER_MAX_RETRIES'] ?? 3);
  return Number.isFinite(raw) && raw >= 0 ? Math.min(raw, 10) : 3;
}

/** Fail closed when production worker would run without explicit enablement. */
export function assertSettlementImportWorkerAllowed(context: string): void {
  if (readSettlementEnvironment() === 'production' && !isLiveSettlementImportEnabled()) {
    throw Errors.problem(
      503,
      'LIVE_SETTLEMENT_IMPORT_DISABLED',
      'Live settlement import disabled',
      `${context}: SETTLEMENT_IMPORT_LIVE_ENABLED=true required for production settlement import worker.`,
    );
  }
}

export function workerImportIdempotencyKey(
  providerCode: string,
  countryId: string,
  externalBatchRef: string,
): string {
  return `worker:${providerCode}:${countryId}:${externalBatchRef}`;
}

export function workerRetryBackoffMs(retryCount: number): number {
  const base = Number(process.env['SETTLEMENT_IMPORT_WORKER_RETRY_MS'] ?? 5_000);
  return Math.min(base * 2 ** Math.max(retryCount - 1, 0), 120_000);
}

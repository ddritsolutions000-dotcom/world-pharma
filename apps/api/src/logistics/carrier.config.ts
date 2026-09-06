/**
 * Sprint 46 — Logistics / carrier runtime environment.
 * Live carrier/fleet requires explicit enablement. Sandbox MockCarrierAdapter remains default.
 */
import { Errors } from '../common/problem';

export type LogisticsRuntimeEnvironment = 'sandbox' | 'production';

export function readLogisticsEnvironment(): LogisticsRuntimeEnvironment {
  const raw =
    process.env['LOGISTICS_ENVIRONMENT']?.trim().toLowerCase() ??
    process.env['CARRIER_ENVIRONMENT']?.trim().toLowerCase();
  if (!raw || raw === 'sandbox') {
    return 'sandbox';
  }
  if (raw === 'production' || raw === 'prod' || raw === 'live') {
    return 'production';
  }
  return 'sandbox';
}

/** True only when explicitly enabled — never default on. */
export function isLiveCarrierEnabled(): boolean {
  return process.env['CARRIER_LIVE_ENABLED'] === 'true' || process.env['LOGISTICS_LIVE_ENABLED'] === 'true';
}

/** Mock / sandbox carrier identifiers must never serve production shipments. */
export function isMockCarrierCode(carrierCode: string | null | undefined): boolean {
  if (!carrierCode) {
    return false;
  }
  const upper = carrierCode.trim().toUpperCase();
  return upper === 'MOCK' || upper.startsWith('MOCK_') || upper.includes('SANDBOX');
}

/**
 * Fail closed when production logistics environment is set without live enablement.
 * Sandbox MockCarrierAdapter remains the only active path until gates close.
 */
export function assertSandboxOnlyLogisticsRuntime(context: string): void {
  if (readLogisticsEnvironment() === 'production' && !isLiveCarrierEnabled()) {
    throw Errors.problem(
      503,
      'LOGISTICS_LIVE_DISABLED',
      'Live logistics disabled',
      `${context}: LOGISTICS_ENVIRONMENT=production requires CARRIER_LIVE_ENABLED=true and a verified CARRIER ProductionDependency. Sandbox only.`,
    );
  }
}

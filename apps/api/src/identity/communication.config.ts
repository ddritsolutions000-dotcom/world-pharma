/**
 * Sprint 45 — Communication / OTP runtime environment.
 * Live OTP/SMS/email requires explicit enablement. Sandbox remains default.
 */
import { Errors } from '../common/problem';

export type CommunicationRuntimeEnvironment = 'sandbox' | 'production';

export function readCommunicationEnvironment(): CommunicationRuntimeEnvironment {
  const raw =
    process.env['COMMUNICATION_ENVIRONMENT']?.trim().toLowerCase() ??
    process.env['OTP_ENVIRONMENT']?.trim().toLowerCase();
  if (!raw || raw === 'sandbox') {
    return 'sandbox';
  }
  if (raw === 'production' || raw === 'prod' || raw === 'live') {
    return 'production';
  }
  return 'sandbox';
}

/** True only when explicitly enabled — never default on. */
export function isLiveOtpEnabled(): boolean {
  return (
    process.env['OTP_LIVE_ENABLED'] === 'true' ||
    process.env['COMMUNICATION_LIVE_ENABLED'] === 'true'
  );
}

/** Mock / console / sandbox provider identifiers must never serve production OTP. */
export function isMockOtpProvider(providerIdentifier: string | null | undefined): boolean {
  if (!providerIdentifier) {
    return false;
  }
  const upper = providerIdentifier.trim().toUpperCase();
  return (
    upper === 'CONSOLE' ||
    upper === 'MOCK' ||
    upper.startsWith('MOCK_') ||
    upper.startsWith('SANDBOX_') ||
    upper.includes('CONSOLE')
  );
}

/**
 * Fail closed when production communication environment is set without live enablement.
 * Sandbox OTP adapters remain the only active path until gates close.
 */
export function assertSandboxOnlyCommunicationRuntime(context: string): void {
  if (readCommunicationEnvironment() === 'production' && !isLiveOtpEnabled()) {
    throw Errors.problem(
      503,
      'LIVE_OTP_DISABLED',
      'Live OTP disabled',
      `${context}: COMMUNICATION_ENVIRONMENT=production requires OTP_LIVE_ENABLED=true and a verified OTP_PROVIDER dependency. Sandbox only.`,
    );
  }
}

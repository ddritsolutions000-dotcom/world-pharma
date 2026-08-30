import { Errors } from '../common/problem';

/** Sandbox mock settlement providers must never serve production traffic. */
export function isMockSettlementProviderCode(providerCode: string): boolean {
  return providerCode === 'MOCK' || providerCode.startsWith('MOCK_');
}

export function assertSandboxSettlementProvider(providerCode: string, environment: string): void {
  if (environment !== 'sandbox' && isMockSettlementProviderCode(providerCode)) {
    throw Errors.problem(
      409,
      'MOCK_SETTLEMENT_PRODUCTION_FORBIDDEN',
      'Mock settlement forbidden',
      `Settlement provider "${providerCode}" is sandbox-only and cannot be used in environment "${environment}".`,
    );
  }
}

export function readSettlementEnvironment(): 'sandbox' | 'production' {
  const raw = process.env['SETTLEMENT_IMPORT_ENVIRONMENT']?.trim().toLowerCase();
  if (!raw || raw === 'sandbox') {
    return 'sandbox';
  }
  if (raw === 'production' || raw === 'prod' || raw === 'live') {
    return 'production';
  }
  return 'sandbox';
}

export function isLiveSettlementImportEnabled(): boolean {
  return process.env['SETTLEMENT_IMPORT_LIVE_ENABLED'] === 'true';
}

/** Fail closed when production settlement import is requested without explicit enablement. */
export function assertSettlementImportAllowed(context: string): void {
  if (readSettlementEnvironment() === 'production' && !isLiveSettlementImportEnabled()) {
    throw Errors.problem(
      503,
      'LIVE_SETTLEMENT_IMPORT_DISABLED',
      'Live settlement import disabled',
      `${context}: SETTLEMENT_IMPORT_LIVE_ENABLED=true required for production settlement import.`,
    );
  }
}

export function assertSettlementProviderRegistered(
  providerCode: string,
  environment: string,
  isRegistered: boolean,
  context: string,
): void {
  assertSandboxSettlementProvider(providerCode, environment);
  assertSettlementImportAllowed(context);
  if (!isRegistered) {
    throw Errors.problem(
      503,
      'SETTLEMENT_PROVIDER_NOT_CONFIGURED',
      'Settlement provider not configured',
      `${context}: no settlement import adapter registered for "${providerCode}".`,
    );
  }
}

import { Errors } from '../common/problem';
import { assertHumanGatesAllowLive, type R14AGateSnapshot } from './r14a-gate';

/** Active payment runtime environment. Live production requires explicit human-gate authorization. */
export type PaymentRuntimeEnvironment = 'sandbox' | 'production';

/** Safe configuration contract — references only, never secret values. */
export type PaymentGatewaySecretRef = {
  /** e.g. `env:PAYMENT_MOCK_WEBHOOK_SECRET` or `vault:prod/payments/{psp}/api-key` */
  ref: string;
  environment: PaymentRuntimeEnvironment;
};

export function readPaymentEnvironment(): PaymentRuntimeEnvironment {
  const raw = process.env['PAYMENT_ENVIRONMENT']?.trim().toLowerCase();
  if (!raw || raw === 'sandbox') {
    return 'sandbox';
  }
  if (raw === 'production' || raw === 'prod' || raw === 'live') {
    return 'production';
  }
  return 'sandbox';
}

/** True only when explicitly enabled — never default on. Human gates must precede live traffic. */
export function isLivePaymentEnabled(): boolean {
  return process.env['PAYMENT_LIVE_ENABLED'] === 'true';
}

/** Sandbox mock gateway codes must never serve production traffic. */
export function isMockGatewayCode(gatewayCode: string): boolean {
  return gatewayCode === 'MOCK' || gatewayCode.startsWith('MOCK_');
}

/**
 * Fail closed when a mock/sandbox gateway is bound to a non-sandbox environment row.
 * Prevents accidental production routing to MockPaymentGatewayAdapter.
 */
export function assertSandboxGatewayCode(gatewayCode: string, gatewayEnvironment: string): void {
  if (gatewayEnvironment !== 'sandbox' && isMockGatewayCode(gatewayCode)) {
    throw Errors.problem(
      409,
      'MOCK_GATEWAY_PRODUCTION_FORBIDDEN',
      'Mock gateway forbidden',
      `Gateway "${gatewayCode}" is sandbox-only and cannot be used in environment "${gatewayEnvironment}".`,
    );
  }
}

/**
 * Fail closed when production payment environment is requested without explicit live enablement.
 * Sandbox remains the only active environment until human gates close.
 */
export function assertSandboxOnlyRuntime(context: string): void {
  if (readPaymentEnvironment() === 'production' && !isLivePaymentEnabled()) {
    throw Errors.problem(
      503,
      'LIVE_PAYMENTS_DISABLED',
      'Live payments disabled',
      `${context}: PAYMENT_ENVIRONMENT=production requires PAYMENT_LIVE_ENABLED=true and completed human gates. Sandbox only.`,
    );
  }
}

/** Resolve a secret reference path — never returns the secret value. */
export function describeGatewaySecretRef(gatewayCode: string): PaymentGatewaySecretRef | null {
  const envKey = `PAYMENT_GATEWAY_${gatewayCode.replace(/[^A-Z0-9_]/gi, '_').toUpperCase()}_SECRET_REF`;
  const ref = process.env[envKey]?.trim();
  if (!ref) {
    return null;
  }
  return { ref, environment: readPaymentEnvironment() };
}

/** Human-gate authorized production countries — comma-separated ISO2 list; empty means none. */
export function isProductionCountryAuthorized(countryIso2: string): boolean {
  const raw = process.env['PAYMENT_PRODUCTION_COUNTRIES']?.trim();
  if (!raw) {
    return false;
  }
  const upper = countryIso2.trim().toUpperCase();
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .includes(upper);
}

/** Production requires an approved non-sandbox risk adapter — allowlist/sandbox stubs are rejected. */
export function isProductionRiskConfigured(): boolean {
  const adapter = process.env['PAYMENT_RISK_ADAPTER']?.trim().toLowerCase();
  return Boolean(adapter && adapter !== 'allowlist' && adapter !== 'sandbox');
}

export function assertProductionRiskConfigured(context: string): void {
  if (!isProductionRiskConfigured()) {
    throw Errors.problem(
      503,
      'PRODUCTION_RISK_NOT_CONFIGURED',
      'Production risk not configured',
      `${context}: PAYMENT_RISK_ADAPTER must name an approved production risk implementation.`,
    );
  }
}

export function assertProductionCredentialsPresent(gatewayCode: string, context: string): void {
  if (!describeGatewaySecretRef(gatewayCode)) {
    throw Errors.problem(
      503,
      'PRODUCTION_CREDENTIALS_MISSING',
      'Production credentials missing',
      `${context}: secret reference required for gateway "${gatewayCode}" (PAYMENT_GATEWAY_*_SECRET_REF).`,
    );
  }
}

export function assertProductionCountryAuthorized(countryIso2: string, context: string): void {
  if (!isProductionCountryAuthorized(countryIso2)) {
    throw Errors.problem(
      403,
      'PRODUCTION_COUNTRY_NOT_AUTHORIZED',
      'Production country not authorized',
      `${context}: country "${countryIso2}" is not in PAYMENT_PRODUCTION_COUNTRIES.`,
    );
  }
}

/**
 * Structural production-path guard — fail closed until human gates and runtime config are complete.
 * Does not activate production routing; only validates prerequisites when production is requested.
 */
export function assertLiveProductionPrerequisites(
  context: string,
  opts: { gatewayCode?: string; countryIso2?: string; humanGates?: readonly R14AGateSnapshot[] } = {},
): void {
  if (!isLivePaymentEnabled()) {
    throw Errors.problem(
      503,
      'LIVE_PAYMENTS_DISABLED',
      'Live payments disabled',
      `${context}: PAYMENT_LIVE_ENABLED=true required for production payment paths.`,
    );
  }
  assertHumanGatesAllowLive(opts.humanGates, context);
  if (opts.gatewayCode) {
    assertSandboxGatewayCode(opts.gatewayCode, 'production');
    assertProductionCredentialsPresent(opts.gatewayCode, context);
  }
  if (opts.countryIso2) {
    assertProductionCountryAuthorized(opts.countryIso2, context);
  }
  assertProductionRiskConfigured(context);
}

/** Active submit path — sandbox only until human gates close. */
export function assertPaymentSubmitAllowed(context: string): void {
  assertSandboxOnlyRuntime(context);
}

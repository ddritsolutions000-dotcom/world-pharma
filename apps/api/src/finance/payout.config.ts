/**
 * Partner / affiliate live payout configuration.
 * Never invent bank success. Live path requires non-mock adapter + secrets + human gates.
 */
import { readPaymentEnvironment, type PaymentRuntimeEnvironment } from '../payment/payment.config';

export function isLivePayoutEnabled(): boolean {
  return process.env['PAYOUT_LIVE_ENABLED']?.trim().toLowerCase() === 'true';
}

/** Mock / sandbox payout identifiers must never count as production disbursement. */
export function isMockPayoutProvider(code: string | null | undefined): boolean {
  if (!code) return true;
  const upper = code.trim().toUpperCase();
  return upper === 'MOCK' || upper.startsWith('MOCK_') || upper.includes('SANDBOX');
}

export type PartnerPayoutProviderCode = 'MOCK' | 'RAZORPAYX';

export type PartnerPayoutRuntimeConfig = {
  environment: PaymentRuntimeEnvironment;
  provider: PartnerPayoutProviderCode;
  payout_live_enabled: boolean;
  human_approved: boolean;
  emergency_disabled: boolean;
  credentials_present: boolean;
  webhook_secret_present: boolean;
  beneficiary_encryption_ready: boolean;
  legal_attested: boolean;
  kyc_attested: boolean;
  dual_control_attested: boolean;
  adapter_code: string;
  live_ready: boolean;
  remaining_blocker: string | null;
};

function envTrue(key: string): boolean {
  return process.env[key]?.trim().toLowerCase() === 'true';
}

/** Resolve secret value from direct env or `env:KEY` / plain value ref. Never log the value. */
export function resolvePayoutSecret(refOrValue: string | undefined): string | null {
  const raw = refOrValue?.trim();
  if (!raw) return null;
  if (raw.startsWith('env:')) {
    const key = raw.slice(4).trim();
    return process.env[key]?.trim() || null;
  }
  if (raw.startsWith('vault:')) {
    // Vault resolution is EXTERNAL_GATED in this environment — treat as not resolved.
    return null;
  }
  return raw;
}

export function readPartnerPayoutProvider(): PartnerPayoutProviderCode {
  const raw = (process.env['PAYOUT_PROVIDER'] ?? process.env['AFFILIATE_PAYOUT_PROVIDER'] ?? 'MOCK')
    .trim()
    .toUpperCase();
  if (raw === 'RAZORPAYX' || raw === 'RAZORPAY_X' || raw === 'RAZORPAY') {
    return 'RAZORPAYX';
  }
  return 'MOCK';
}

export function canUseLiveAdapterCode(code: string): boolean {
  return !isMockPayoutProvider(code);
}

export function readPartnerPayoutRuntimeConfig(): PartnerPayoutRuntimeConfig {
  const environment = readPaymentEnvironment();
  const provider = readPartnerPayoutProvider();
  const payout_live_enabled = isLivePayoutEnabled();
  const human_approved =
    envTrue('PROVIDER_APPROVED_AFFILIATE_PAYOUT') || envTrue('PROVIDER_APPROVED_PAYOUT');
  const emergency_disabled =
    envTrue('PROVIDER_EMERGENCY_DISABLE_ALL') ||
    envTrue('PROVIDER_EMERGENCY_DISABLE_AFFILIATE_PAYOUT') ||
    envTrue('PROVIDER_EMERGENCY_DISABLE_PAYOUT');

  const keyId = resolvePayoutSecret(
    process.env['RAZORPAYX_KEY_ID'] ?? process.env['AFFILIATE_PAYOUT_KEY_ID'],
  );
  const keySecret = resolvePayoutSecret(
    process.env['RAZORPAYX_KEY_SECRET'] ??
      process.env['AFFILIATE_PAYOUT_SECRET'] ??
      process.env['AFFILIATE_PAYOUT_CREDENTIAL_SECRET_REF'],
  );
  const credentials_present = Boolean(keyId && keySecret) && provider === 'RAZORPAYX';
  const webhook_secret_present = Boolean(
    resolvePayoutSecret(process.env['RAZORPAYX_WEBHOOK_SECRET'] ?? process.env['PAYOUT_WEBHOOK_SECRET']),
  );
  const beneficiary_encryption_ready = Boolean(
    resolvePayoutSecret(process.env['PAYOUT_BENEFICIARY_ENCRYPTION_KEY']),
  );
  const legal_attested = envTrue('PAYOUT_LEGAL_ATTESTED');
  const kyc_attested = envTrue('PAYOUT_KYC_ATTESTED');
  const dual_control_attested = envTrue('PAYOUT_DUAL_CONTROL_ATTESTED');

  const adapter_code = provider === 'RAZORPAYX' && credentials_present ? 'RAZORPAYX' : 'MOCK';
  const nonMock = !isMockPayoutProvider(adapter_code);

  let remaining_blocker: string | null = null;
  if (emergency_disabled) remaining_blocker = 'PROVIDER_EMERGENCY_DISABLE';
  else if (!nonMock) remaining_blocker = 'NO_PRODUCTION_PAYOUT_ADAPTER';
  else if (!credentials_present) remaining_blocker = 'PAYOUT_CREDENTIALS_MISSING';
  else if (!beneficiary_encryption_ready) remaining_blocker = 'BENEFICIARY_ENCRYPTION_KEY_MISSING';
  else if (!webhook_secret_present) remaining_blocker = 'PAYOUT_WEBHOOK_SECRET_MISSING';
  else if (environment !== 'production') remaining_blocker = 'PAYMENT_ENVIRONMENT_NOT_PRODUCTION';
  else if (!human_approved) remaining_blocker = 'PROVIDER_APPROVAL_MISSING';
  else if (!legal_attested) remaining_blocker = 'PAYOUT_LEGAL_NOT_ATTESTED';
  else if (!kyc_attested) remaining_blocker = 'PAYOUT_KYC_NOT_ATTESTED';
  else if (!dual_control_attested) remaining_blocker = 'PAYOUT_DUAL_CONTROL_NOT_ATTESTED';
  else if (!payout_live_enabled) remaining_blocker = 'PAYOUT_LIVE_ENABLED_FALSE';

  const live_ready = remaining_blocker === null;

  return {
    environment,
    provider,
    payout_live_enabled,
    human_approved,
    emergency_disabled,
    credentials_present,
    webhook_secret_present,
    beneficiary_encryption_ready,
    legal_attested,
    kyc_attested,
    dual_control_attested,
    adapter_code,
    live_ready,
    remaining_blocker,
  };
}

/** True only when production disbursement may leave the ledger hold and call a non-mock adapter. */
export function isLivePartnerPayoutReady(): boolean {
  return readPartnerPayoutRuntimeConfig().live_ready;
}

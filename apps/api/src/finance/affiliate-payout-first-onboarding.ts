/**
 * Sprint 71 — First production affiliate / partner payout onboarding (fail-closed).
 * Never invent payout providers, bank accounts, wallets, beneficiaries, or real transfers.
 * Never print secrets / beneficiary account numbers.
 *
 * Accrual / commission ledger ≠ bank-executed payout.
 * MockPayoutAdapter sandbox simulation ≠ production disbursement.
 */
import {
  isLivePaymentEnabled,
  isMockGatewayCode,
  readPaymentEnvironment,
} from '../payment/payment.config';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';
import {
  isLivePayoutEnabled,
  isMockPayoutProvider,
  readPartnerPayoutRuntimeConfig,
} from './payout.config';

export { isLivePayoutEnabled, isMockPayoutProvider } from './payout.config';

export type PayoutValidationStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED_BUT_UNAVAILABLE'
  | 'VERIFIED_BUT_DISABLED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'EXTERNAL_GATED'
  | 'NOT_SELECTED';

export type PayoutEnablementGuardCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export type PayoutLegalGateItem = {
  id: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_VERIFICATION' | 'VERIFIED' | 'BLOCKED' | 'EXTERNAL_GATED';
  owner: string;
  evidence_required: string;
  blocker: string;
  next_action: string;
};

export type PayoutCapabilityStatus =
  | 'SANDBOX_VERIFIED'
  | 'EXTERNAL_GATED'
  | 'NOT_SELECTED'
  | 'SANDBOX_ONLY'
  | 'POLICY_DRIVEN';

export type AffiliatePayoutFirstOnboardingReport = {
  sprint: 71;
  provider: 'NOT_SELECTED' | string;
  environment: 'sandbox' | 'production';
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: boolean;
  validation_status: PayoutValidationStatus;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_AVAILABLE';
  production: 'EXTERNAL_GATED' | 'BLOCKED' | 'ENABLED';
  payout_status: 'SANDBOX_ONLY' | 'NOT_VERIFIED' | 'EXTERNAL_GATED';
  beneficiary_verification: 'EXTERNAL_GATED' | 'SANDBOX_AVAILABLE';
  kyc_gate: 'EXTERNAL_GATED';
  country_support: 'POLICY_DRIVEN' | 'EXTERNAL_GATED';
  currency_support: 'POLICY_DRIVEN' | 'EXTERNAL_GATED';
  settlement_requirements: 'LEDGER_REQUIRED' | 'EXTERNAL_GATED';
  legal_financial_gate: 'EXTERNAL_GATED';
  webhook_reconciliation: 'SANDBOX_ONLY' | 'EXTERNAL_GATED';
  double_payout_protection: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  ledger_protection: 'SANDBOX_VERIFIED';
  emergency_disable: 'SUPPORTED';
  capabilities: Record<string, PayoutCapabilityStatus>;
  payout_statuses_supported: string[];
  real_payout_available: false | true;
  runtime_adapter: 'mock' | 'none' | 'razorpayx';
  activation_stage: string;
  remaining_blocker: 'NO_PRODUCTION_PAYOUT_ADAPTER' | string;
  s64_external_blocker: string | null;
  next_action: string;
  enablement_guard: {
    can_enable: false | true;
    checks: PayoutEnablementGuardCheck[];
  };
  legal_gate_items: PayoutLegalGateItem[];
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  secrets_printed: false;
  beneficiary_secrets_printed: false;
  message: string;
};

/** Deterministic validator — credentials alone never yield ENABLED. */
export function validateAffiliatePayoutConfiguration(input: {
  providerSelected: boolean;
  nonMockProductionAdapterRegistered: boolean;
  paymentEnvironment: 'sandbox' | 'production';
  payoutLiveEnabled: boolean;
  humanApproved: boolean;
  credentialsPresent: boolean;
  beneficiaryRailsConfigured: boolean;
  kycProviderReady: boolean;
  countrySupportConfigured: boolean;
  currencySupportConfigured: boolean;
  webhookConfigured: boolean;
  legalFinancialConfigured: boolean;
}): PayoutValidationStatus {
  if (!input.providerSelected) return 'NOT_SELECTED';
  if (!input.nonMockProductionAdapterRegistered) return 'NOT_CONFIGURED';
  const core =
    input.credentialsPresent &&
    input.beneficiaryRailsConfigured &&
    input.kycProviderReady &&
    input.countrySupportConfigured &&
    input.currencySupportConfigured &&
    input.legalFinancialConfigured;
  if (!core) return 'NOT_CONFIGURED';
  if (!input.webhookConfigured || input.paymentEnvironment !== 'production') {
    return 'CONFIGURED_BUT_UNAVAILABLE';
  }
  if (!input.humanApproved) return 'VERIFIED';
  if (!input.payoutLiveEnabled) return 'VERIFIED_BUT_DISABLED';
  return 'APPROVED';
}

export function evaluateAffiliatePayoutEnablementGuard(input: {
  nonMockProductionAdapterRegistered: boolean;
  paymentEnvironment: 'sandbox' | 'production';
  payoutLiveEnabled: boolean;
  humanApproved: boolean;
  legalFinancialClear: boolean;
  kycProviderReady: boolean;
  webhookProductionReady: boolean;
  dualControlReady: boolean;
  emergencyDisabled: boolean;
}): { can_enable: false | true; checks: PayoutEnablementGuardCheck[] } {
  const checks: PayoutEnablementGuardCheck[] = [
    {
      id: 'non_mock_adapter',
      ok: input.nonMockProductionAdapterRegistered,
      detail: input.nonMockProductionAdapterRegistered
        ? 'Non-mock production payout adapter registered'
        : 'Only MockPayoutAdapter — NO_PRODUCTION_PAYOUT_ADAPTER',
    },
    {
      id: 'environment_production',
      ok: input.paymentEnvironment === 'production',
      detail: `PAYMENT_ENVIRONMENT=${input.paymentEnvironment}`,
    },
    {
      id: 'payout_live_flag',
      ok: input.payoutLiveEnabled,
      detail: input.payoutLiveEnabled
        ? 'PAYOUT_LIVE_ENABLED=true'
        : 'PAYOUT_LIVE_ENABLED is not true',
    },
    {
      id: 'human_approved',
      ok: input.humanApproved,
      detail: input.humanApproved
        ? 'Human approval recorded'
        : 'PROVIDER_APPROVED_AFFILIATE_PAYOUT missing',
    },
    {
      id: 'legal_financial_gate',
      ok: input.legalFinancialClear,
      detail: input.legalFinancialClear
        ? 'Legal/financial prerequisites verified'
        : 'Legal/financial payout gate EXTERNAL_GATED',
    },
    {
      id: 'kyc_beneficiary',
      ok: input.kycProviderReady,
      detail: input.kycProviderReady
        ? 'KYC/beneficiary verification ready'
        : 'KYC / beneficiary verification EXTERNAL_GATED',
    },
    {
      id: 'webhook_reconciliation',
      ok: input.webhookProductionReady,
      detail: input.webhookProductionReady
        ? 'Production payout webhook ready'
        : 'Production payout webhook EXTERNAL_GATED',
    },
    {
      id: 'dual_control',
      ok: input.dualControlReady,
      detail: input.dualControlReady
        ? 'Dual-control approval ready'
        : 'Dual-control / finance approval EXTERNAL_GATED',
    },
    {
      id: 'not_emergency_disabled',
      ok: !input.emergencyDisabled,
      detail: input.emergencyDisabled ? 'Emergency disable active' : 'No emergency disable',
    },
  ];
  return { can_enable: checks.every((c) => c.ok) ? true : false, checks };
}

export function listAffiliatePayoutLegalFinancialGateItems(): PayoutLegalGateItem[] {
  return [
    {
      id: 'provider_contract',
      status: 'EXTERNAL_GATED',
      owner: 'Finance / Legal',
      evidence_required: 'Signed payout/disbursement vendor contract + DPA',
      blocker: 'No production payout provider selected',
      next_action: 'Procure bank/wallet payout rail vendor',
    },
    {
      id: 'kyc_aml',
      status: 'EXTERNAL_GATED',
      owner: 'Compliance',
      evidence_required: 'KYC/AML provider + beneficiary verification evidence',
      blocker: 'KYC_PROVIDER_EXTERNAL_GATED',
      next_action: 'Do not enable live payouts without KYC/AML clearance',
    },
    {
      id: 'beneficiary_rails',
      status: 'EXTERNAL_GATED',
      owner: 'Finance ops',
      evidence_required: 'Destination account/wallet rails per market',
      blocker: 'No production beneficiary rails configured',
      next_action: 'Configure country-policy payout methods after vendor selection',
    },
    {
      id: 'tax_reporting',
      status: 'EXTERNAL_GATED',
      owner: 'Finance / Legal',
      evidence_required: 'Tax/withholding requirements per market',
      blocker: 'Tax reporting not production-attested',
      next_action: 'Complete tax/reporting review per launch country',
    },
    {
      id: 'dual_control',
      status: 'EXTERNAL_GATED',
      owner: 'Finance ops',
      evidence_required: 'Maker-checker / dual approval for disbursements',
      blocker: 'Production dual-control not attested',
      next_action: 'Confirm dual-control before PAYOUT_LIVE_ENABLED',
    },
    {
      id: 'webhook_reconciliation',
      status: 'EXTERNAL_GATED',
      owner: 'Platform / Finance',
      evidence_required: 'Signed webhooks + reconciliation runbook',
      blocker: 'Production payout webhook EXTERNAL_GATED',
      next_action: 'Wire signed callbacks + recon after vendor selection',
    },
    {
      id: 'country_currency_policy',
      status: 'EXTERNAL_GATED',
      owner: 'Finance / Product',
      evidence_required: 'Per-country payout method + currency policy pack',
      blocker: 'Market payout methods not production-certified',
      next_action: 'Confirm policy packs; never hardcode a single market rail',
    },
  ];
}

/** Authoritative Sprint 71 snapshot — driven by payout.config runtime (fail-closed). */
export function evaluateAffiliatePayoutFirstOnboarding(): AffiliatePayoutFirstOnboardingReport {
  const env = readPaymentEnvironment();
  const payoutLive = isLivePayoutEnabled();
  const activation = evaluateProviderActivation(getProviderActivationContract('AFFILIATE_PAYOUT'));
  const humanApproved =
    process.env['PROVIDER_APPROVED_AFFILIATE_PAYOUT']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_APPROVED_PAYOUT']?.trim().toLowerCase() === 'true';
  const emergency =
    process.env['PROVIDER_EMERGENCY_DISABLE_ALL']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_AFFILIATE_PAYOUT']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_PAYOUT']?.trim().toLowerCase() === 'true';

  void isMockGatewayCode('MOCK');
  void isLivePaymentEnabled();

  const cfg = readPartnerPayoutRuntimeConfig();
  const real = !isMockPayoutProvider(cfg.adapter_code) && cfg.credentials_present;
  const guard = evaluateAffiliatePayoutEnablementGuard({
    nonMockProductionAdapterRegistered: real,
    paymentEnvironment: env,
    payoutLiveEnabled: payoutLive,
    humanApproved,
    legalFinancialClear: cfg.legal_attested,
    kycProviderReady: cfg.kyc_attested,
    webhookProductionReady: cfg.webhook_secret_present,
    dualControlReady: cfg.dual_control_attested,
    emergencyDisabled: emergency,
  });

  const validation_status = validateAffiliatePayoutConfiguration({
    providerSelected: cfg.provider !== 'MOCK',
    nonMockProductionAdapterRegistered: real,
    paymentEnvironment: env,
    payoutLiveEnabled: payoutLive,
    humanApproved,
    credentialsPresent: cfg.credentials_present,
    beneficiaryRailsConfigured: cfg.beneficiary_encryption_ready,
    kycProviderReady: cfg.kyc_attested,
    countrySupportConfigured: true,
    currencySupportConfigured: true,
    webhookConfigured: cfg.webhook_secret_present,
    legalFinancialConfigured: cfg.legal_attested,
  });

  const live = cfg.live_ready;

  return {
    sprint: 71,
    provider: cfg.provider === 'MOCK' ? 'NOT_SELECTED' : cfg.provider,
    environment: env,
    configured: real && cfg.credentials_present,
    verified: validation_status === 'VERIFIED' || validation_status === 'VERIFIED_BUT_DISABLED' || validation_status === 'APPROVED',
    approved: humanApproved,
    enabled: live,
    validation_status: live ? 'ENABLED' : validation_status,
    sandbox: 'SANDBOX_VERIFIED',
    production: live ? 'ENABLED' : emergency ? 'BLOCKED' : 'EXTERNAL_GATED',
    payout_status: live ? 'NOT_VERIFIED' : real ? 'NOT_VERIFIED' : 'SANDBOX_ONLY',
    beneficiary_verification: cfg.beneficiary_encryption_ready ? 'SANDBOX_AVAILABLE' : 'EXTERNAL_GATED',
    kyc_gate: cfg.kyc_attested ? ('EXTERNAL_GATED' as const) : 'EXTERNAL_GATED',
    country_support: 'POLICY_DRIVEN',
    currency_support: 'POLICY_DRIVEN',
    settlement_requirements: 'LEDGER_REQUIRED',
    legal_financial_gate: cfg.legal_attested ? 'EXTERNAL_GATED' : 'EXTERNAL_GATED',
    webhook_reconciliation: cfg.webhook_secret_present ? 'SANDBOX_ONLY' : 'EXTERNAL_GATED',
    double_payout_protection: 'SANDBOX_VERIFIED',
    ledger_protection: 'SANDBOX_VERIFIED',
    emergency_disable: 'SUPPORTED',
    capabilities: {
      commission_accrual: 'SANDBOX_VERIFIED',
      settlement_statement: 'SANDBOX_VERIFIED',
      payout_eligibility: 'SANDBOX_VERIFIED',
      payout_execution: live ? 'SANDBOX_VERIFIED' : 'SANDBOX_ONLY',
      bank_transfer: live ? 'SANDBOX_VERIFIED' : 'EXTERNAL_GATED',
      wallet_transfer: live ? 'SANDBOX_VERIFIED' : 'EXTERNAL_GATED',
      beneficiary_kyc: cfg.kyc_attested ? 'SANDBOX_VERIFIED' : 'EXTERNAL_GATED',
      webhook_callback: cfg.webhook_secret_present ? 'SANDBOX_VERIFIED' : 'EXTERNAL_GATED',
      reconciliation: 'SANDBOX_VERIFIED',
      idempotency: 'SANDBOX_VERIFIED',
      dual_control: cfg.dual_control_attested ? 'SANDBOX_VERIFIED' : 'EXTERNAL_GATED',
      country_currency_policy: 'POLICY_DRIVEN',
      emergency_disable: 'SANDBOX_VERIFIED',
    },
    payout_statuses_supported: [
      'CREATED',
      'APPROVED',
      'SUBMITTED',
      'PROCESSING',
      'PAID',
      'FAILED',
      'UNKNOWN',
      'REVERSED',
    ],
    real_payout_available: live,
    runtime_adapter: real ? 'razorpayx' : 'mock',
    activation_stage: activation.stage,
    remaining_blocker: cfg.remaining_blocker ?? 'NO_PRODUCTION_PAYOUT_ADAPTER',
    s64_external_blocker: activation.external_blocker,
    next_action: live
      ? 'Live partner payout gates clear. Withdraws submit via RazorpayX; PAID only after webhook.'
      : 'No gateway yet — keep using sandbox. When Razorpay is ready: set PAYOUT_PROVIDER=RAZORPAYX + keys + webhook + encryption + attestations + PAYOUT_LIVE_ENABLED. See partner-payout-software-readiness.',
    enablement_guard: guard,
    legal_gate_items: listAffiliatePayoutLegalFinancialGateItems(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    secrets_printed: false,
    beneficiary_secrets_printed: false,
    message: live
      ? 'Live partner payout rail enabled. Provider webhook confirms PAID. Accrual still ≠ bank-paid until webhook.'
      : 'Sandbox ready for all partners. No payment gateway connected. Razorpay adapter is registered but dormant until credentials — production EXTERNAL_GATED.',
  };
}

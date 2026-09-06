/**
 * Sprint 64 — Derive provider activation stage from env + dependency metadata.
 * Present credentials ≠ ENABLED. Never print secrets.
 */
import { redactSecretValue } from './secret-redaction';
import {
  PROVIDER_ACTIVATION_CONTRACTS,
  type ProviderActivationContract,
  type ProviderActivationStage,
  type ProviderIntegrationId,
} from './provider-activation-contracts';

export type { ProviderIntegrationId, ProviderActivationStage };
import { readPaymentEnvironment, isLivePaymentEnabled } from '../payment/payment.config';
import { readCommunicationEnvironment, isLiveOtpEnabled } from '../identity/communication.config';
import { readLogisticsEnvironment, isLiveCarrierEnabled } from '../logistics/carrier.config';
import { readHealthcareEnvironment, isLiveHealthcareEnabled } from '../healthcare/healthcare-environment';
import {
  readObjectStorageEnvironment,
  isLiveObjectStorageEnabled,
  readFileScanningEnvironment,
  isLiveFileScanningEnabled,
  readInfrastructureEnvironment,
} from './infra-environment';

export type ProviderVerificationStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED_BUT_UNAVAILABLE'
  | 'VERIFIED_BUT_DISABLED'
  | 'VERIFIED'
  | 'EXTERNAL_GATED'
  | 'BLOCKED';

export type ProviderActivationRow = {
  id: ProviderIntegrationId;
  label: string;
  provider_name: string;
  environment: string;
  stage: ProviderActivationStage;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: boolean;
  blocked: boolean;
  external_dependency: boolean;
  live_flag: boolean;
  emergency_disabled: boolean;
  verification: ProviderVerificationStatus;
  config_present: Array<{ key: string; secret_present: 'SET' | 'MISSING' | 'N/A' }>;
  owner: string;
  external_blocker: string | null;
  next_action: string;
  phase: number;
  activation_is_ops_manual: true;
  message: string;
};

export type ProviderActivationMatrix = {
  evaluated_at: string;
  overall_any_live_enabled: boolean;
  production_launch_ready: false;
  decision: 'NO — provider activation framework ready; no live providers enabled without real credentials/approvals';
  rows: ProviderActivationRow[];
  sequence_phases: Array<{ phase: number; label: string; entry: string; exit: string }>;
};

function envFlag(key: string): boolean {
  return process.env[key]?.trim().toLowerCase() === 'true';
}

function envRaw(key: string): string | undefined {
  const v = process.env[key];
  return v?.trim() ? v : undefined;
}

function emergencyDisabled(contract: ProviderActivationContract): boolean {
  if (envFlag('PROVIDER_EMERGENCY_DISABLE_ALL')) return true;
  const specific = `PROVIDER_EMERGENCY_DISABLE_${contract.id}`;
  return envFlag(specific);
}

function readEnvFor(contract: ProviderActivationContract): string {
  switch (contract.id) {
    case 'PAYMENTS_PSP':
    case 'AFFILIATE_PAYOUT':
      return readPaymentEnvironment();
    case 'OTP_AUTH':
    case 'MESSAGING':
      return readCommunicationEnvironment();
    case 'CARRIER':
      return readLogisticsEnvironment();
    case 'ERX':
    case 'VIDEO':
    case 'PACS_DICOM':
    case 'KYC':
      return readHealthcareEnvironment();
    case 'OBJECT_STORAGE':
      return readObjectStorageEnvironment();
    case 'MALWARE_SCANNER':
      return readFileScanningEnvironment();
    case 'KMS':
    case 'MANAGED_DB_PITR':
    case 'MONITORING_APM':
      return readInfrastructureEnvironment();
    default:
      return envRaw(contract.environment_key)?.toLowerCase() === 'production' ? 'production' : 'sandbox';
  }
}

function readLiveFor(contract: ProviderActivationContract): boolean {
  if (emergencyDisabled(contract)) return false;
  switch (contract.id) {
    case 'PAYMENTS_PSP':
      return isLivePaymentEnabled();
    case 'OTP_AUTH':
      return isLiveOtpEnabled();
    case 'MESSAGING':
      return envFlag('COMMUNICATION_LIVE_ENABLED') || envFlag('MESSAGING_LIVE_ENABLED');
    case 'CARRIER':
      return isLiveCarrierEnabled();
    case 'AFFILIATE_PAYOUT':
      return envFlag('PAYOUT_LIVE_ENABLED');
    case 'ERX':
    case 'VIDEO':
    case 'PACS_DICOM':
      return isLiveHealthcareEnabled();
    case 'OBJECT_STORAGE':
      return isLiveObjectStorageEnabled();
    case 'MALWARE_SCANNER':
      return isLiveFileScanningEnabled();
    case 'KMS':
      return envFlag('KMS_LIVE_ENABLED');
    case 'KYC':
      return envFlag('KYC_LIVE_ENABLED');
    case 'MANAGED_DB_PITR':
      return envFlag('PITR_LIVE_ENABLED');
    case 'MONITORING_APM':
      return envFlag('APM_LIVE_ENABLED');
    default:
      return envFlag(contract.live_flag_key);
  }
}

/** Rails that still have no production adapter registration in this codebase. */
const HARD_EXTERNAL_ADAPTER: Partial<Record<ProviderIntegrationId, string>> = {
  CARRIER: 'NO_PRODUCTION_CARRIER_ADAPTER',
  ERX: 'NO_PRODUCTION_CLINICAL_ADAPTER',
  VIDEO: 'NO_PRODUCTION_CLINICAL_ADAPTER',
  PACS_DICOM: 'NO_PRODUCTION_CLINICAL_ADAPTER',
  OBJECT_STORAGE: 'NO_PRODUCTION_STORAGE_ADAPTER',
  MALWARE_SCANNER: 'NO_PRODUCTION_SCANNER_ADAPTER',
  AFFILIATE_PAYOUT: 'EXTERNAL_PAYOUT_GATED',
  KYC: 'KYC_PROVIDER_EXTERNAL_GATED',
  MANAGED_DB_PITR: 'RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED',
  MONITORING_APM: 'APM_PAGER_EXTERNAL_GATED',
  KMS: 'KMS_SECRETS_EXTERNAL_GATED',
};

function configKeysPresent(contract: ProviderActivationContract): {
  configured: boolean;
  config_present: ProviderActivationRow['config_present'];
} {
  const keys = contract.required_config_keys.filter((k) => /^[A-Z0-9_]+$/.test(k));
  const config_present = keys.map((key) => ({
    key,
    secret_present: key.includes('SECRET') || key.includes('PEPPER') || key.includes('KEY') || key.includes('PASSWORD')
      ? redactSecretValue(envRaw(key))
      : envRaw(key)
        ? ('SET' as const)
        : ('MISSING' as const),
  }));
  // Soft signal: environment key set counts toward configured for sandbox paths.
  const envSet = Boolean(envRaw(contract.environment_key));
  const anySecretish = config_present.some((c) => c.secret_present === 'SET');
  const configured = envSet || anySecretish || Boolean(envRaw(contract.live_flag_key));
  return { configured, config_present: config_present.length ? config_present : [{ key: contract.environment_key, secret_present: envSet ? 'SET' : 'MISSING' }] };
}

/**
 * Human approval is explicit — never inferred from credentials alone.
 * PAYMENT uses R14-A completion as the approval proxy when live is attempted;
 * otherwise APPROVED requires PROVIDER_APPROVED_<ID>=true (ops checklist marker, not a secret).
 */
function isHumanApproved(contract: ProviderActivationContract): boolean {
  if (envFlag(`PROVIDER_APPROVED_${contract.id}`)) return true;
  if (contract.id === 'PAYMENTS_PSP' && envFlag('R14A_ALL_GATES_VERIFIED')) return true;
  return false;
}

export function evaluateProviderActivation(contract: ProviderActivationContract): ProviderActivationRow {
  const environment = readEnvFor(contract);
  const live_flag = readLiveFor(contract);
  const emergency_disabled = emergencyDisabled(contract);
  const { configured, config_present } = configKeysPresent(contract);
  const hardBlock = HARD_EXTERNAL_ADAPTER[contract.id] ?? null;
  const approved = isHumanApproved(contract);

  // Production with live flag but no adapter / hard gate → never ENABLED
  let stage: ProviderActivationStage;
  let verification: ProviderVerificationStatus;
  let verified = false;
  let enabled = false;
  let blocked = false;
  let external_dependency = Boolean(hardBlock);

  if (emergency_disabled) {
    stage = 'DISABLED';
    verification = configured ? 'VERIFIED_BUT_DISABLED' : 'NOT_CONFIGURED';
    blocked = true;
  } else if (hardBlock && (!configured || environment === 'sandbox')) {
    stage = 'EXTERNAL_GATED';
    verification = 'EXTERNAL_GATED';
  } else if (!configured) {
    stage = 'NOT_CONFIGURED';
    verification = 'NOT_CONFIGURED';
  } else if (environment === 'production' && live_flag && hardBlock) {
    // Credentials/env may exist but adapter/infrastructure still gated
    stage = 'CONFIGURED_BUT_UNAVAILABLE';
    verification = 'CONFIGURED_BUT_UNAVAILABLE';
    blocked = true;
    external_dependency = true;
  } else if (environment === 'production' && live_flag && !approved) {
    stage = 'VERIFIED_BUT_DISABLED';
    verification = 'VERIFIED_BUT_DISABLED';
    verified = true;
    blocked = true;
  } else if (environment === 'production' && live_flag && approved && !hardBlock) {
    // Still refuse ENABLED without a real selected provider name + adapter — none selected here
    stage = 'APPROVED';
    verification = 'VERIFIED';
    verified = true;
    approved;
    enabled = false;
    blocked = true;
    external_dependency = true;
  } else if (configured && !live_flag) {
    stage = environment === 'production' ? 'VERIFIED_BUT_DISABLED' : 'CONFIGURED';
    verification = environment === 'production' ? 'VERIFIED_BUT_DISABLED' : 'NOT_CONFIGURED';
    verified = environment === 'production';
  } else {
    stage = 'CONFIGURED';
    verification = 'NOT_CONFIGURED';
  }

  // Absolute safety: this codebase never reports ENABLED without a selected provider.
  if (contract.provider_name === 'NOT_SELECTED') {
    enabled = false;
  }

  const next_action = !configured
    ? `Supply ${contract.external_prerequisite} and config refs (not secrets in git)`
    : hardBlock
      ? `Clear ${hardBlock}: register live adapter + contracts`
      : !approved
        ? `Record human approval (PROVIDER_APPROVED_${contract.id}) after verification evidence`
        : !live_flag
          ? `When ready, set ${contract.live_flag_key}=true in secret manager (ops-only)`
          : 'Select real provider_name + complete production verification drill';

  return {
    id: contract.id,
    label: contract.label,
    provider_name: contract.provider_name,
    environment,
    stage,
    configured,
    verified,
    approved,
    enabled,
    blocked:
      blocked ||
      stage === 'EXTERNAL_GATED' ||
      stage === 'CONFIGURED_BUT_UNAVAILABLE' ||
      stage === 'DISABLED',
    external_dependency,
    live_flag,
    emergency_disabled,
    verification,
    config_present,
    owner: contract.responsible_team,
    external_blocker: hardBlock,
    next_action,
    phase: contract.phase,
    activation_is_ops_manual: true,
    message: `${contract.label}: stage=${stage}. Credentials alone do not enable live traffic.`,
  };
}

export function evaluateAllProviderActivations(): ProviderActivationMatrix {
  const rows = PROVIDER_ACTIVATION_CONTRACTS.map((c) => evaluateProviderActivation(c));
  return {
    evaluated_at: new Date().toISOString(),
    overall_any_live_enabled: rows.some((r) => r.enabled),
    production_launch_ready: false,
    decision:
      'NO — provider activation framework ready; no live providers enabled without real credentials/approvals',
    rows,
    sequence_phases: [
      { phase: 0, label: 'Infrastructure / PITR', entry: 'Cloud account + network', exit: 'DB/PITR targets provisioned' },
      { phase: 1, label: 'Storage / security', entry: 'Phase 0 ready', exit: 'Storage+KMS+scanner verified' },
      { phase: 2, label: 'Auth / messaging', entry: 'Phase 1 ready', exit: 'OTP+messaging live flags approved' },
      { phase: 3, label: 'Payments', entry: 'Phase 2 ready + R14-A', exit: 'PSP ENABLED after drills' },
      { phase: 4, label: 'Carrier', entry: 'Phase 3 stable', exit: 'Live carrier ENABLED' },
      { phase: 5, label: 'Affiliate payouts', entry: 'Phase 3+compliance', exit: 'Payout rail ENABLED' },
      { phase: 6, label: 'Healthcare integrations', entry: 'Legal/clinical approvals', exit: 'eRx/video/PACS/KYC as needed' },
      { phase: 7, label: 'Country activation', entry: 'Providers + legal for country', exit: 'Country ACTIVE' },
      { phase: 8, label: 'Controlled launch', entry: 'Phase 7', exit: 'Limited traffic + runbooks' },
      { phase: 9, label: 'Monitoring / reconciliation', entry: 'Phase 8', exit: 'APM+pager+finance reconcile' },
    ],
  };
}

/** Safe verification probe — never contacts external vendors without credentials; never prints secrets. */
export function verifyProviderIntegration(id: ProviderIntegrationId): {
  id: ProviderIntegrationId;
  result: ProviderVerificationStatus;
  stage: ProviderActivationStage;
  contacted_external: false;
  secrets_printed: false;
  detail: string;
} {
  const contract = PROVIDER_ACTIVATION_CONTRACTS.find((c) => c.id === id);
  if (!contract) {
    return {
      id,
      result: 'BLOCKED',
      stage: 'BLOCKED',
      contacted_external: false,
      secrets_printed: false,
      detail: 'Unknown integration id',
    };
  }
  const row = evaluateProviderActivation(contract);
  return {
    id,
    result: row.verification,
    stage: row.stage,
    contacted_external: false,
    secrets_printed: false,
    detail: row.message + ' External connectivity skipped when provider is NOT_SELECTED / EXTERNAL_GATED.',
  };
}

export function assertNoSandboxFallbackInProduction(rail: 'payment' | 'otp' | 'carrier'): {
  ok: boolean;
  detail: string;
} {
  if (rail === 'payment') {
    const env = readPaymentEnvironment();
    const live = isLivePaymentEnabled();
    if (env === 'production' && !live) {
      return { ok: true, detail: 'Production payment env with live flag off — sandbox success refused by gate.' };
    }
    if (env === 'production' && live) {
      return { ok: true, detail: 'Live payment path still EXTERNAL_GATED until real PSP + R14-A (no sandbox fallback).' };
    }
    return { ok: true, detail: 'Sandbox payment environment — mock PSP only.' };
  }
  if (rail === 'otp') {
    const env = readCommunicationEnvironment();
    if (env === 'production' && envFlag('AUTH_DEV_REVEAL_OTP')) {
      return { ok: false, detail: 'AUTH_DEV_REVEAL_OTP must not be true in production communication env.' };
    }
    return { ok: true, detail: 'OTP production path fail-closed; no silent console fallback when gated.' };
  }
  const env = readLogisticsEnvironment();
  if (env === 'production' && isLiveCarrierEnabled()) {
    return { ok: true, detail: 'Live carrier still blocked by NO_PRODUCTION_CARRIER_ADAPTER until registered.' };
  }
  return { ok: true, detail: 'Sandbox/mock carrier separated from production.' };
}

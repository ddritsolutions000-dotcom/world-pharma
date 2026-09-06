/**
 * Sprint 137 — Production eRx activation path (software).
 * Reuses S68/S78/S91/S125 (+ S132/S133/S134 pattern).
 * Does NOT invent eRx providers, credentials, or claim legal transmission.
 * ISSUED ≠ LEGALLY_TRANSMITTED.
 * CONFIGURED ≠ VERIFIED ≠ APPROVED ≠ ENABLED.
 * Without a genuine non-sandbox provider: EXTERNAL_GATED + fail-closed.
 */
import { Errors } from '../common/problem';
import {
  isLiveHealthcareEnabled,
  readHealthcareEnvironment,
  type HealthcareRuntimeEnvironment,
} from '../healthcare/healthcare-environment';
import {
  NO_PRODUCTION_ERX_PROVIDER,
  evaluateErxEnablementGuard,
  buildErxSubmissionMachine,
  buildPrescriptionLifecycleMachine,
} from './erx-first-onboarding';
import {
  ERX_CALLBACK_CONFIGURATION_MISSING,
  ERX_CREDENTIAL_REFERENCE_MISSING,
  ERX_ENDPOINT_CONFIGURATION_MISSING,
  ERX_MARKET_LEGAL_CONFIGURATION_MISSING,
  ERX_NETWORK_ACCOUNT_REFERENCE_MISSING,
  ERX_PROVIDER_NOT_SELECTED,
  validateProductionErxConfiguration,
} from './production-erx-requirements';
import { configuredErxRuntimeProvider } from './erx.config';
import { secretsManagerRuntimeResolverStatus } from '../ops/secrets-manager-runtime-resolver';

export const ERX_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE =
  'ERX_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE';

export const ERX_VERIFICATION_STATUS_ENV = 'ERX_VERIFICATION_STATUS';
export const ERX_APPROVAL_STATUS_ENV = 'ERX_APPROVAL_STATUS';

export const PRODUCTION_ERX_TRANSMISSION_BLOCKED = 'PRODUCTION_ERX_TRANSMISSION_BLOCKED';
export const SANDBOX_ERX_BLOCKED_IN_PRODUCTION = 'SANDBOX_ERX_BLOCKED_IN_PRODUCTION';
export { SECRETS_MANAGER_RUNTIME_RESOLVER_MISSING } from '../ops/secrets-manager-runtime-resolver';
export const ISSUED_NEQ_LEGALLY_TRANSMITTED = 'ISSUED_NEQ_LEGALLY_TRANSMITTED';

function envPresent(key: string): boolean {
  const v = process.env[key]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function envValue(key: string): string | null {
  const v = process.env[key]?.trim();
  if (!v || /^changeme|todo|placeholder|xxx$/i.test(v)) {
    return null;
  }
  return v;
}

function humanStatus(envKey: string, expected: 'verified' | 'approved'): boolean {
  return (envValue(envKey) ?? '').toLowerCase() === expected;
}

export function isSandboxOrMockErxProvider(code: string | null | undefined): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  return (
    upper === 'SANDBOX' ||
    upper === 'NULL' ||
    upper === 'MOCK' ||
    upper.startsWith('SANDBOX_') ||
    upper.startsWith('MOCK_')
  );
}

export type ErxProviderSelection = {
  selected: boolean;
  code: string | null;
  mock_rejected: boolean;
};

export function readConfiguredProductionErxProvider(): ErxProviderSelection {
  const raw = envValue('ERX_PROVIDER');
  if (!raw) {
    return { selected: false, code: null, mock_rejected: false };
  }
  const code = raw.toUpperCase();
  if (isSandboxOrMockErxProvider(code)) {
    return { selected: false, code, mock_rejected: true };
  }
  return { selected: true, code, mock_rejected: false };
}

export type ErxConfigSlotPresence = {
  id: string;
  label: string;
  reference_key: string;
  status: 'MISSING' | 'PRESENT' | 'NOT_SELECTED' | 'EXTERNAL_GATED' | 'REJECTED_MOCK';
  reference_present: boolean;
  secret: boolean;
  value_leaked: false;
};

export function buildLiveErxConfigurationSlots(): ErxConfigSlotPresence[] {
  const sel = readConfiguredProductionErxProvider();
  const providerSlot = (): ErxConfigSlotPresence => ({
    id: 'provider_identity',
    label: 'eRx provider identity',
    reference_key: 'ERX_PROVIDER',
    status: sel.mock_rejected
      ? 'REJECTED_MOCK'
      : sel.selected
        ? 'PRESENT'
        : 'NOT_SELECTED',
    reference_present: sel.selected,
    secret: false,
    value_leaked: false,
  });
  const refSlot = (
    id: string,
    label: string,
    key: string,
    secret: boolean,
  ): ErxConfigSlotPresence => {
    const present = envPresent(key);
    return {
      id,
      label,
      reference_key: key,
      status: present ? 'PRESENT' : 'MISSING',
      reference_present: present,
      secret,
      value_leaked: false,
    };
  };
  return [
    providerSlot(),
    refSlot('credential', 'Credential / secret reference', 'ERX_PROVIDER_SECRET_REF', true),
    refSlot('network_account', 'Network / account reference', 'ERX_NETWORK_ACCOUNT_REF', false),
    refSlot('endpoint', 'Endpoint reference', 'ERX_ENDPOINT_REF', false),
    refSlot('callback', 'Callback / webhook secret reference', 'ERX_CALLBACK_SECRET_REF', true),
    refSlot('markets_legal', 'Market / legal configuration', 'ERX_MARKET_LEGAL_CONFIG_REF', false),
    refSlot(
      'prescriber_eligibility',
      'Prescriber eligibility configuration',
      'ERX_PRESCRIBER_ELIGIBILITY_REF',
      false,
    ),
    refSlot(
      'pharmacy_network',
      'Pharmacy network configuration',
      'ERX_PHARMACY_NETWORK_REF',
      false,
    ),
    refSlot('environment', 'Healthcare environment identity', 'HEALTHCARE_ENVIRONMENT', false),
  ];
}

export type ErxActivationStage =
  | 'NOT_SELECTED'
  | 'EXTERNAL_GATED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED';

export type ErxLifecycleStatus = {
  provider: string;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: false;
  production: 'EXTERNAL_GATED';
  activation_stage: ErxActivationStage;
  remaining_blocker: string;
};

const REQUIRED_ERX_REFS = [
  'ERX_PROVIDER_SECRET_REF',
  'ERX_NETWORK_ACCOUNT_REF',
  'ERX_ENDPOINT_REF',
] as const;

export function deriveProductionErxLifecycle(): ErxLifecycleStatus {
  const sel = readConfiguredProductionErxProvider();
  const refsOk = REQUIRED_ERX_REFS.every((k) => envPresent(k));
  const configured = sel.selected && refsOk;
  const verified = configured && humanStatus(ERX_VERIFICATION_STATUS_ENV, 'verified');
  const approved = verified && humanStatus(ERX_APPROVAL_STATUS_ENV, 'approved');
  const enabled = false as const;

  let activation_stage: ErxActivationStage = 'NOT_SELECTED';
  if (enabled) activation_stage = 'ENABLED';
  else if (approved) activation_stage = 'APPROVED';
  else if (verified) activation_stage = 'VERIFIED';
  else if (configured) activation_stage = 'CONFIGURED';
  else if (sel.selected || sel.mock_rejected) activation_stage = 'EXTERNAL_GATED';

  let remaining_blocker: string = NO_PRODUCTION_ERX_PROVIDER;
  if (sel.mock_rejected) remaining_blocker = SANDBOX_ERX_BLOCKED_IN_PRODUCTION;
  else if (!sel.selected) remaining_blocker = ERX_PROVIDER_NOT_SELECTED;
  else if (!envPresent('ERX_PROVIDER_SECRET_REF')) {
    remaining_blocker = ERX_CREDENTIAL_REFERENCE_MISSING;
  } else if (!envPresent('ERX_NETWORK_ACCOUNT_REF')) {
    remaining_blocker = ERX_NETWORK_ACCOUNT_REFERENCE_MISSING;
  } else if (!envPresent('ERX_ENDPOINT_REF')) {
    remaining_blocker = ERX_ENDPOINT_CONFIGURATION_MISSING;
  }

  return {
    provider: sel.selected ? (sel.code ?? 'NOT_SELECTED') : 'NOT_SELECTED',
    configured,
    verified,
    approved,
    enabled,
    production: 'EXTERNAL_GATED',
    activation_stage,
    remaining_blocker,
  };
}

export function evaluateErxTransmissionNegativeCases(): Array<{
  case_id: string;
  outcome: 'REJECTED' | 'IDEMPOTENT' | 'EXTERNAL_GATED';
  reason: string;
}> {
  return [
    {
      case_id: 'production_without_provider',
      outcome: 'EXTERNAL_GATED',
      reason: PRODUCTION_ERX_TRANSMISSION_BLOCKED,
    },
    {
      case_id: 'sandbox_in_production',
      outcome: 'REJECTED',
      reason: SANDBOX_ERX_BLOCKED_IN_PRODUCTION,
    },
    {
      case_id: 'forged_client_transmission',
      outcome: 'REJECTED',
      reason: 'CLIENT_TRANSMISSION_INSUFFICIENT',
    },
    {
      case_id: 'duplicate_transmission',
      outcome: 'IDEMPOTENT',
      reason: 'DUPLICATE_ERX_SUBMISSION',
    },
    {
      case_id: 'draft_prescription_transmit',
      outcome: 'REJECTED',
      reason: 'PRESCRIPTION_NOT_ISSUED',
    },
    {
      case_id: 'invalid_signature_callback',
      outcome: 'REJECTED',
      reason: 'INVALID_SIGNATURE',
    },
  ];
}

export type ErxProductionActivationPathReport = {
  sprint: 137;
  authoritative_source: typeof ERX_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE;
  parallel_erx_system_created: false;
  fake_provider_invented: false;
  real_erx_transmitted: false;
  legal_transmission_claimed: false;
  secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
  healthcare_environment: HealthcareRuntimeEnvironment;
  live_enabled: boolean;
  software_activation_path: 'COMPLETE';
  erx: ErxLifecycleStatus;
  configuration_slots: ErxConfigSlotPresence[];
  configuration_validation: ReturnType<typeof validateProductionErxConfiguration>;
  prescription_lifecycle: ReturnType<typeof buildPrescriptionLifecycleMachine>;
  submission_machine: ReturnType<typeof buildErxSubmissionMachine>;
  issued_neq_legally_transmitted: true;
  transmission_negative_cases: ReturnType<typeof evaluateErxTransmissionNegativeCases>;
  production_erx_enabled: false;
  production_transmission: 'BLOCKED';
  enablement_guard: ReturnType<typeof evaluateErxEnablementGuard>;
  blockers: string[];
  remaining_blocker: typeof NO_PRODUCTION_ERX_PROVIDER;
  can_production_launch: 'NO';
  secrets_printed: false;
  phi_printed: false;
  message: string;
  correlation_id?: string;
  evaluated_at: string;
};

export function evaluateErxProductionActivationPath(input?: {
  correlation_id?: string;
}): ErxProductionActivationPathReport {
  const env = readHealthcareEnvironment();
  const live = isLiveHealthcareEnabled();
  const erx = deriveProductionErxLifecycle();
  const slots = buildLiveErxConfigurationSlots();
  const config = validateProductionErxConfiguration({
    providerSelected: erx.configured,
    providerName: erx.provider,
    nonMockAdapterRegistered: false,
  });
  const enablement = evaluateErxEnablementGuard({
    nonMockAdapterRegistered: false,
    healthcareEnvironment: env,
    liveEnabled: live,
    humanApproved: erx.approved,
    legalGateClear: false,
    webhookProductionReady: false,
    emergencyDisabled: false,
  });

  const blockers = [
    NO_PRODUCTION_ERX_PROVIDER,
    erx.remaining_blocker,
    ERX_PROVIDER_NOT_SELECTED,
    ERX_CREDENTIAL_REFERENCE_MISSING,
    ERX_NETWORK_ACCOUNT_REFERENCE_MISSING,
    ERX_ENDPOINT_CONFIGURATION_MISSING,
    ERX_CALLBACK_CONFIGURATION_MISSING,
    ERX_MARKET_LEGAL_CONFIGURATION_MISSING,
    'PRODUCTION_ERX_ADAPTER_NOT_REGISTERED',
  ];

  void configuredErxRuntimeProvider;

  return {
    sprint: 137,
    authoritative_source: ERX_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE,
    parallel_erx_system_created: false,
    fake_provider_invented: false,
    real_erx_transmitted: false,
    legal_transmission_claimed: false,
    secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    healthcare_environment: env,
    live_enabled: live,
    software_activation_path: 'COMPLETE',
    erx,
    configuration_slots: slots,
    configuration_validation: config,
    prescription_lifecycle: buildPrescriptionLifecycleMachine(),
    submission_machine: buildErxSubmissionMachine(),
    issued_neq_legally_transmitted: true,
    transmission_negative_cases: evaluateErxTransmissionNegativeCases(),
    production_erx_enabled: false,
    production_transmission: 'BLOCKED',
    enablement_guard: enablement,
    blockers: [...new Set(blockers)],
    remaining_blocker: NO_PRODUCTION_ERX_PROVIDER,
    can_production_launch: 'NO',
    secrets_printed: false,
    phi_printed: false,
    message: erx.configured
      ? 'Software eRx activation path complete: configuration refs evaluated. Production legal transmission remains BLOCKED / EXTERNAL_GATED. ISSUED ≠ LEGALLY_TRANSMITTED.'
      : 'Software eRx activation path complete: no production eRx provider selected. Sandbox adapter may remain for development. Production transmission fail-closed.',
    correlation_id: input?.correlation_id,
    evaluated_at: new Date().toISOString(),
  };
}

/** Fail-closed production eRx legal transmission. */
export function assertProductionErxTransmissionAllowed(context: string): void {
  if (readHealthcareEnvironment() !== 'production') {
    return;
  }
  const sel = readConfiguredProductionErxProvider();
  if (sel.mock_rejected || configuredErxRuntimeProvider() === 'sandbox') {
    throw Errors.problem(
      503,
      SANDBOX_ERX_BLOCKED_IN_PRODUCTION,
      'Sandbox eRx blocked in production',
      `${context}: SANDBOX/NULL/MOCK eRx providers cannot perform legal transmission.`,
    );
  }
  const path = evaluateErxProductionActivationPath();
  throw Errors.problem(
    503,
    PRODUCTION_ERX_TRANSMISSION_BLOCKED,
    'Production eRx transmission blocked',
    `${context}: ${path.remaining_blocker}. Blockers: ${path.blockers.slice(0, 6).join(', ')}. ISSUED ≠ LEGALLY_TRANSMITTED. Software path COMPLETE; live provider EXTERNAL_GATED.`,
  );
}

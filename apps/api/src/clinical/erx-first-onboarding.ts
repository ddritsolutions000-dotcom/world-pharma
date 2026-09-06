/**
 * Sprint 68 foundation + Sprint 78 readiness + Sprint 91 production eRx /
 * prescription transmission activation readiness.
 * Never invent eRx providers, credentials, or legal transmission. Never print secrets/PHI.
 *
 * INTERNAL prescription record (DRAFT/ISSUED/…) ≠ LEGALLY TRANSMITTED electronic prescription.
 */
import {
  configuredErxRuntimeProvider,
  isErxRuntimeConfiguredForPackProvider,
} from './erx.config';
import {
  isLiveHealthcareEnabled,
  readHealthcareEnvironment,
} from '../healthcare/healthcare-environment';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';
import {
  ERX_PROVIDER_NOT_SELECTED,
  validateProductionErxConfiguration,
  type ProductionErxConfigurationValidation,
} from './production-erx-requirements';

/** Sprint 78/91 primary activation blocker (eRx rail). Never remove. */
export const NO_PRODUCTION_ERX_PROVIDER = 'NO_PRODUCTION_ERX_PROVIDER';
/** Historical / healthcare-gate blocker code retained for production fail-closed. */
export const NO_PRODUCTION_CLINICAL_ADAPTER = 'NO_PRODUCTION_CLINICAL_ADAPTER';

export {
  ERX_PROVIDER_NOT_SELECTED,
  ERX_CREDENTIAL_REFERENCE_MISSING,
  ERX_NETWORK_ACCOUNT_REFERENCE_MISSING,
  ERX_ENDPOINT_CONFIGURATION_MISSING,
  ERX_CALLBACK_CONFIGURATION_MISSING,
  ERX_MARKET_LEGAL_CONFIGURATION_MISSING,
  ERX_PRESCRIBER_ELIGIBILITY_CONFIGURATION_MISSING,
  ERX_PHARMACY_NETWORK_CONFIGURATION_MISSING,
} from './production-erx-requirements';

export type ErxValidationStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED'
  | 'CONFIGURED_BUT_UNAVAILABLE'
  | 'VERIFIED_BUT_DISABLED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'EXTERNAL_GATED'
  | 'NOT_SELECTED'
  | 'DISABLED';

export type ErxActivationLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type ErxEnablementGuardCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export type ErxLegalGateItem = {
  id: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_VERIFICATION' | 'VERIFIED' | 'BLOCKED' | 'EXTERNAL_GATED';
  owner: string;
  evidence_required: string;
  blocker: string;
  next_action: string;
};

export type PrescriptionLifecycleMachine = {
  success_path: string[];
  exception_states: string[];
  notes: string[];
  terminal_overwrite_forbidden: true;
  idempotent_submission: true;
  issued_not_equal_legally_transmitted: true;
};

export type ErxSubmissionMachine = {
  statuses: string[];
  notes: string[];
  never_claims_legal_without_provider: true;
  /** Maps conceptual transmission states onto existing submission statuses. */
  conceptual_aliases: Record<string, string>;
};

export type ErxWebhookSecurity = {
  status: 'NOT_APPLICABLE' | 'SANDBOX_ONLY' | 'EXTERNAL_GATED';
  unsigned_fail_closed: true;
  invalid_signature_rejected: true;
  duplicate_idempotent: true;
  secrets_logged: false;
  phi_logged: false;
};

export type ErxFirstOnboardingReport = {
  /** Production activation readiness sprint; foundation S78 on S68 rail. */
  sprint: 91;
  foundation_sprint: 78;
  provider: 'NOT_SELECTED' | string;
  environment: 'sandbox' | 'production';
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: boolean;
  validation_status: ErxValidationStatus;
  activation_lifecycle: ErxActivationLifecycle;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_AVAILABLE';
  production: 'EXTERNAL_GATED' | 'BLOCKED' | 'ENABLED';
  transmission: 'SANDBOX_ONLY' | 'NOT_VERIFIED' | 'EXTERNAL_GATED';
  webhook: 'NOT_APPLICABLE' | 'SANDBOX_ONLY' | 'EXTERNAL_GATED';
  country_support: 'POLICY_DRIVEN' | 'EXTERNAL_GATED' | 'POLICY_REQUIRED';
  legal_clinical_gate: 'EXTERNAL_GATED';
  controlled_substances: 'EXTERNAL_GATED' | 'LEGAL_GATED';
  pharmacy_network: 'EXTERNAL_GATED';
  internal_vs_legal:
    | 'INTERNAL_RECORD_SEPARATE_FROM_LEGAL_TRANSMISSION'
    | string;
  prescription_statuses_supported: string[];
  erx_submission_statuses_supported: string[];
  prescription_lifecycle: PrescriptionLifecycleMachine;
  erx_submission_lifecycle: ErxSubmissionMachine;
  webhook_security: ErxWebhookSecurity;
  real_erx_available: false | true;
  runtime_provider: 'sandbox' | null | string;
  activation_stage: string;
  remaining_blocker: typeof NO_PRODUCTION_ERX_PROVIDER | string;
  remaining_blockers: string[];
  related_clinical_blocker: typeof NO_PRODUCTION_CLINICAL_ADAPTER;
  next_action: string;
  enablement_guard: {
    can_enable: false | true;
    checks: ErxEnablementGuardCheck[];
  };
  configuration_validation: ProductionErxConfigurationValidation;
  force_launch_available: false;
  country_policy: {
    status: 'POLICY_DRIVEN';
    hardcoded_market: false;
    markets_supported_for_evaluation: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    note: string;
  };
  legal_gate_items: ErxLegalGateItem[];
  permission_model: {
    customer_own_prescriptions_only: true;
    customer_cannot_issue_or_transmit: true;
    doctor_scoped_clinical_access: true;
    doctor_cannot_bypass_provider_gate: true;
    pharmacy_fulfillment_minimum_necessary: true;
    pharmacy_cannot_issue_or_impersonate_prescriber: true;
    tenant_isolation: true;
    admin_activation_oversight_not_universal_phi: true;
  };
  observability: {
    audit_events: true;
    correlation_id: true;
    no_phi_in_logs: true;
    not_selected_suppresses_false_outage: true;
  };
  outbox_idempotency: {
    prescription_version_keys: 'DETERMINISTIC';
    duplicate_transmission_prevented: true;
    duplicate_callback_safe: true;
    timeout_not_auto_transmitted: true;
  };
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  phi_printed: false;
  fake_provider_invented: false;
  fake_legal_transmission_claimed: false;
  message: string;
};

/** Sandbox / null adapters must never count as production eRx. */
export function isMockOrNullErxProvider(code: string | null | undefined): boolean {
  if (!code) return true;
  const upper = code.trim().toUpperCase();
  return (
    upper === 'NULL' ||
    upper === 'SANDBOX' ||
    upper.startsWith('MOCK') ||
    upper.includes('SANDBOX')
  );
}

/** Deterministic validator — credentials alone never yield ENABLED. */
export function validateErxConfiguration(input: {
  providerSelected: boolean;
  nonMockAdapterRegistered: boolean;
  healthcareEnvironment: 'sandbox' | 'production';
  liveEnabled: boolean;
  humanApproved: boolean;
  credentialsPresent: boolean;
  accountIdentifierPresent: boolean;
  endpointConfigured: boolean;
  capabilityConfigured: boolean;
  countrySupportConfigured: boolean;
  webhookOrCallbackConfigured: boolean;
  legalClinicalConfigured: boolean;
}): ErxValidationStatus {
  if (!input.providerSelected) return 'NOT_SELECTED';
  if (!input.nonMockAdapterRegistered) return 'NOT_CONFIGURED';
  const core =
    input.credentialsPresent &&
    input.accountIdentifierPresent &&
    input.endpointConfigured &&
    input.capabilityConfigured &&
    input.countrySupportConfigured &&
    input.legalClinicalConfigured;
  if (!core) return 'NOT_CONFIGURED';
  if (!input.webhookOrCallbackConfigured || input.healthcareEnvironment !== 'production') {
    return 'CONFIGURED_BUT_UNAVAILABLE';
  }
  if (!input.humanApproved) return 'VERIFIED';
  if (!input.liveEnabled) return 'VERIFIED_BUT_DISABLED';
  return 'APPROVED';
}

export function evaluateErxEnablementGuard(input: {
  nonMockAdapterRegistered: boolean;
  healthcareEnvironment: 'sandbox' | 'production';
  liveEnabled: boolean;
  humanApproved: boolean;
  legalGateClear: boolean;
  webhookProductionReady: boolean;
  emergencyDisabled: boolean;
  countryPolicyConfigured?: boolean;
}): { can_enable: false | true; checks: ErxEnablementGuardCheck[] } {
  const checks: ErxEnablementGuardCheck[] = [
    {
      id: 'non_mock_adapter',
      ok: input.nonMockAdapterRegistered,
      detail: input.nonMockAdapterRegistered
        ? 'Non-mock eRx adapter registered'
        : `Only NullERxAdapter / SandboxERxAdapter — ${NO_PRODUCTION_ERX_PROVIDER}`,
    },
    {
      id: 'environment_production',
      ok: input.healthcareEnvironment === 'production',
      detail: `HEALTHCARE_ENVIRONMENT=${input.healthcareEnvironment}`,
    },
    {
      id: 'live_flag',
      ok: input.liveEnabled,
      detail: input.liveEnabled
        ? 'HEALTHCARE_LIVE_ENABLED=true'
        : 'HEALTHCARE_LIVE_ENABLED is not true',
    },
    {
      id: 'human_approved',
      ok: input.humanApproved,
      detail: input.humanApproved
        ? 'Human approval recorded'
        : 'PROVIDER_APPROVED_ERX missing',
    },
    {
      id: 'legal_clinical_gate',
      ok: input.legalGateClear,
      detail: input.legalGateClear
        ? 'Legal/clinical prerequisites verified'
        : 'Legal/clinical eRx gate EXTERNAL_GATED',
    },
    {
      id: 'webhook_production',
      ok: input.webhookProductionReady,
      detail: input.webhookProductionReady
        ? 'Production eRx callback ready'
        : 'Production eRx webhook/callback EXTERNAL_GATED',
    },
    {
      id: 'country_policy',
      ok: input.countryPolicyConfigured !== false,
      detail:
        input.countryPolicyConfigured === false
          ? 'Country prescription policy POLICY_REQUIRED'
          : 'Country eRx rules remain POLICY_DRIVEN / LEGAL_REVIEW_REQUIRED per market',
    },
    {
      id: 'not_emergency_disabled',
      ok: !input.emergencyDisabled,
      detail: input.emergencyDisabled ? 'Emergency disable active' : 'No emergency disable',
    },
  ];
  return { can_enable: checks.every((c) => c.ok) ? true : false, checks };
}

export function buildPrescriptionLifecycleMachine(): PrescriptionLifecycleMachine {
  return {
    success_path: ['DRAFT', 'ISSUED', 'FULLY_DISPENSED'],
    exception_states: ['SUPERSEDED', 'CANCELLED', 'EXPIRED'],
    notes: [
      'Reuse existing Prescription domain states — do not invent a second machine.',
      'ISSUED internal record ≠ legally transmitted eRx (ISSUED != LEGALLY_TRANSMITTED).',
      'Invalid transitions rejected; terminal states must not be overwritten.',
      'Submission idempotency uses prescriptionVersionId + outbox occurrence keys.',
      'Conceptual transmission states map onto ErxSubmission statuses (PENDING/SUBMITTED/…), not Prescription.ISSUED.',
    ],
    terminal_overwrite_forbidden: true,
    idempotent_submission: true,
    issued_not_equal_legally_transmitted: true,
  };
}

export function buildErxSubmissionMachine(): ErxSubmissionMachine {
  return {
    statuses: ['PENDING', 'SUBMITTED', 'FAILED', 'UNSUPPORTED', 'CANCELLED'],
    notes: [
      'Sandbox adapter may record sandbox submission statuses only.',
      'Without a production provider, never present SUBMITTED as legal transmission.',
      'Timeout must not auto-promote to SUBMITTED/TRANSMITTED.',
    ],
    never_claims_legal_without_provider: true,
    conceptual_aliases: {
      TRANSMISSION_PENDING: 'PENDING',
      TRANSMITTED: 'SUBMITTED_REQUIRES_PROVIDER_EVIDENCE',
      ACCEPTED: 'PROVIDER_ACK_REQUIRED',
      REJECTED: 'FAILED',
    },
  };
}

export function listErxLegalClinicalGateItems(): ErxLegalGateItem[] {
  return [
    {
      id: 'provider_contract',
      status: 'EXTERNAL_GATED',
      owner: 'Legal / Clinical ops',
      evidence_required: 'Signed eRx vendor contract + DPA',
      blocker: NO_PRODUCTION_ERX_PROVIDER,
      next_action: 'Procure market-authorized eRx vendor',
    },
    {
      id: 'doctor_credential_verification',
      status: 'EXTERNAL_GATED',
      owner: 'Clinical ops',
      evidence_required: 'License/credential verification against market registry',
      blocker: 'Live credential registry EXTERNAL_GATED',
      next_action: 'Wire credential verification after provider selection',
    },
    {
      id: 'market_erx_legality',
      status: 'EXTERNAL_GATED',
      owner: 'Legal',
      evidence_required: 'Per-country legality memo (policy-driven; not hardcoded)',
      blocker: 'Market-specific eRx legality not certified in-product',
      next_action: 'Complete legal review per launch country',
    },
    {
      id: 'pharmacy_network',
      status: 'EXTERNAL_GATED',
      owner: 'Pharmacy ops',
      evidence_required: 'Pharmacy network / routing agreement',
      blocker: 'No live pharmacy network connectivity',
      next_action: 'Configure network after vendor onboarding',
    },
    {
      id: 'prescription_signing',
      status: 'EXTERNAL_GATED',
      owner: 'Clinical / Security',
      evidence_required: 'Signing requirements + key custody',
      blocker: 'Legal e-signature / provider signing EXTERNAL_GATED',
      next_action: 'Define signing path with selected vendor',
    },
    {
      id: 'data_protection',
      status: 'EXTERNAL_GATED',
      owner: 'Privacy / Security',
      evidence_required: 'DPIA / PHI handling for eRx rail',
      blocker: 'Production PHI path not authorized',
      next_action: 'Complete privacy review before enablement',
    },
    {
      id: 'controlled_medications',
      status: 'EXTERNAL_GATED',
      owner: 'Legal / Clinical',
      evidence_required: 'Controlled-substance capability authorization (if any)',
      blocker: 'Controlled prescribing LEGAL_GATED — not enabled',
      next_action: 'Do not enable controlled prescribing without regulatory approval',
    },
    {
      id: 'provider_certification',
      status: 'EXTERNAL_GATED',
      owner: 'Clinical ops',
      evidence_required: 'Vendor certification / go-live attestation',
      blocker: NO_PRODUCTION_CLINICAL_ADAPTER,
      next_action: 'Register non-mock adapter after certification',
    },
  ];
}

/** Authoritative eRx onboarding snapshot — Null + Sandbox adapters only. */
export function evaluateErxFirstOnboarding(): ErxFirstOnboardingReport {
  const env = readHealthcareEnvironment();
  const live = isLiveHealthcareEnabled();
  const activation = evaluateProviderActivation(getProviderActivationContract('ERX'));
  const humanApproved = process.env['PROVIDER_APPROVED_ERX']?.trim().toLowerCase() === 'true';
  const emergency =
    process.env['PROVIDER_EMERGENCY_DISABLE_ALL']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_ERX']?.trim().toLowerCase() === 'true';
  const runtime = configuredErxRuntimeProvider();

  void isErxRuntimeConfiguredForPackProvider('sandbox');
  void isMockOrNullErxProvider(runtime);

  const real = false;
  const guard = evaluateErxEnablementGuard({
    nonMockAdapterRegistered: real,
    healthcareEnvironment: env,
    liveEnabled: live,
    humanApproved,
    legalGateClear: false,
    webhookProductionReady: false,
    emergencyDisabled: emergency,
  });

  const validation_status = validateErxConfiguration({
    providerSelected: false,
    nonMockAdapterRegistered: real,
    healthcareEnvironment: env,
    liveEnabled: live,
    humanApproved,
    credentialsPresent: false,
    accountIdentifierPresent: false,
    endpointConfigured: false,
    capabilityConfigured: false,
    countrySupportConfigured: false,
    webhookOrCallbackConfigured: false,
    legalClinicalConfigured: false,
  });

  const configuration_validation = validateProductionErxConfiguration({
    providerSelected: real,
    providerName: 'NOT_SELECTED',
    nonMockAdapterRegistered: real,
  });

  const remaining_blockers = [
    NO_PRODUCTION_ERX_PROVIDER,
    NO_PRODUCTION_CLINICAL_ADAPTER,
    ...configuration_validation.blockers,
  ];

  return {
    sprint: 91,
    foundation_sprint: 78,
    provider: 'NOT_SELECTED',
    environment: env,
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    validation_status,
    activation_lifecycle: 'NOT_SELECTED',
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    transmission: 'SANDBOX_ONLY',
    webhook: 'NOT_APPLICABLE',
    country_support: 'POLICY_DRIVEN',
    legal_clinical_gate: 'EXTERNAL_GATED',
    controlled_substances: 'LEGAL_GATED',
    pharmacy_network: 'EXTERNAL_GATED',
    internal_vs_legal: 'INTERNAL_RECORD_SEPARATE_FROM_LEGAL_TRANSMISSION',
    prescription_statuses_supported: [
      'DRAFT',
      'ISSUED',
      'SUPERSEDED',
      'CANCELLED',
      'EXPIRED',
      'FULLY_DISPENSED',
    ],
    erx_submission_statuses_supported: [
      'PENDING',
      'SUBMITTED',
      'FAILED',
      'UNSUPPORTED',
      'CANCELLED',
    ],
    prescription_lifecycle: buildPrescriptionLifecycleMachine(),
    erx_submission_lifecycle: buildErxSubmissionMachine(),
    webhook_security: {
      status: 'EXTERNAL_GATED',
      unsigned_fail_closed: true,
      invalid_signature_rejected: true,
      duplicate_idempotent: true,
      secrets_logged: false,
      phi_logged: false,
    },
    real_erx_available: real,
    runtime_provider: runtime,
    activation_stage: activation.stage,
    remaining_blocker: NO_PRODUCTION_ERX_PROVIDER,
    remaining_blockers: [...new Set(remaining_blockers)],
    related_clinical_blocker: NO_PRODUCTION_CLINICAL_ADAPTER,
    next_action:
      'Supply eRx vendor contract + vault secret refs (ERX_PROVIDER_SECRET_REF, ERX_NETWORK_ACCOUNT_REF, ERX_ENDPOINT_REF) + register non-mock ERxPort adapter; clear legal/clinical gate; set PROVIDER_APPROVED_ERX; then HEALTHCARE_LIVE_ENABLED after guard can_enable=true',
    enablement_guard: guard,
    configuration_validation,
    force_launch_available: false,
    country_policy: {
      status: 'POLICY_DRIVEN',
      hardcoded_market: false,
      markets_supported_for_evaluation: ['GLOBAL', 'IN', 'AE', 'US'],
      note: 'Prescription and eRx rules are policy/legal driven per market. Do not invent legality. Controlled substances remain LEGAL_GATED.',
    },
    legal_gate_items: listErxLegalClinicalGateItems(),
    permission_model: {
      customer_own_prescriptions_only: true,
      customer_cannot_issue_or_transmit: true,
      doctor_scoped_clinical_access: true,
      doctor_cannot_bypass_provider_gate: true,
      pharmacy_fulfillment_minimum_necessary: true,
      pharmacy_cannot_issue_or_impersonate_prescriber: true,
      tenant_isolation: true,
      admin_activation_oversight_not_universal_phi: true,
    },
    observability: {
      audit_events: true,
      correlation_id: true,
      no_phi_in_logs: true,
      not_selected_suppresses_false_outage: true,
    },
    outbox_idempotency: {
      prescription_version_keys: 'DETERMINISTIC',
      duplicate_transmission_prevented: true,
      duplicate_callback_safe: true,
      timeout_not_auto_transmitted: true,
    },
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    phi_printed: false,
    fake_provider_invented: false,
    fake_legal_transmission_claimed: false,
    message: `No real eRx provider supplied (${NO_PRODUCTION_ERX_PROVIDER}). Provider NOT_SELECTED. Production EXTERNAL_GATED. Internal prescription records (DRAFT/ISSUED) remain available. SandboxERxAdapter is not legal transmission. ISSUED ≠ LEGALLY_TRANSMITTED. Controlled substances LEGAL_GATED. Sprint 91 readiness on Sprint 78/68 foundation.`,
  };
}

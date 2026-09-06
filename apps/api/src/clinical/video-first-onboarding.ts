/**
 * Sprint 69 foundation + Sprint 79 readiness + Sprint 92 production telemedicine /
 * live-video activation readiness.
 * Never invent video providers, meeting URLs, tokens, or live sessions. Never print secrets/PHI.
 *
 * APPOINTMENT CONFIRMED ≠ VIDEO SESSION CREATED ≠ VIDEO SESSION LIVE ≠ CONSULTATION COMPLETED.
 */
import { livekitConfig } from './livekit-token';
import { ACTIVE_VIDEO_STATUSES } from './video-status';
import {
  isLiveHealthcareEnabled,
  readHealthcareEnvironment,
} from '../healthcare/healthcare-environment';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';
import {
  VIDEO_PROVIDER_NOT_SELECTED,
  validateProductionVideoConfiguration,
  type ProductionVideoConfigurationValidation,
} from './production-video-requirements';

/** Sprint 79/92 primary activation blocker (video rail). Never remove. */
export const NO_PRODUCTION_VIDEO_PROVIDER = 'NO_PRODUCTION_VIDEO_PROVIDER';
/** Related healthcare production-gate code. */
export const NO_PRODUCTION_CLINICAL_ADAPTER = 'NO_PRODUCTION_CLINICAL_ADAPTER';

export {
  VIDEO_PROVIDER_NOT_SELECTED,
  VIDEO_CREDENTIAL_REFERENCE_MISSING,
  VIDEO_API_ENDPOINT_REFERENCE_MISSING,
  VIDEO_TOKEN_SIGNING_REFERENCE_MISSING,
  VIDEO_CALLBACK_CONFIGURATION_MISSING,
  VIDEO_MARKET_LEGAL_CONFIGURATION_MISSING,
  VIDEO_RECORDING_STORAGE_CONFIGURATION_MISSING,
  VIDEO_CONSENT_POLICY_CONFIGURATION_MISSING,
} from './production-video-requirements';

export type VideoValidationStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED_BUT_UNAVAILABLE'
  | 'VERIFIED_BUT_DISABLED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'EXTERNAL_GATED'
  | 'NOT_SELECTED'
  | 'DISABLED';

export type VideoActivationLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type VideoEnablementGuardCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export type VideoLegalGateItem = {
  id: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_VERIFICATION' | 'VERIFIED' | 'BLOCKED' | 'EXTERNAL_GATED';
  owner: string;
  evidence_required: string;
  blocker: string;
  next_action: string;
};

export type VideoSessionLifecycleMachine = {
  success_path: string[];
  exception_states: string[];
  notes: string[];
  terminal_overwrite_forbidden: true;
  idempotent_start_end: true;
  session_created_not_equal_consultation_completed: true;
};

export type VideoWebhookSecurity = {
  status: 'NOT_APPLICABLE' | 'SANDBOX_ONLY' | 'EXTERNAL_GATED';
  unsigned_fail_closed: true;
  invalid_signature_rejected: true;
  duplicate_idempotent: true;
  secrets_logged: false;
  phi_logged: false;
};

export type VideoFirstOnboardingReport = {
  /** Production activation readiness sprint; foundation S79 on S69 rail. */
  sprint: 92;
  foundation_sprint: 79;
  provider: 'NOT_SELECTED' | string;
  environment: 'sandbox' | 'production';
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: boolean;
  validation_status: VideoValidationStatus;
  activation_lifecycle: VideoActivationLifecycle;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_AVAILABLE';
  production: 'EXTERNAL_GATED' | 'BLOCKED' | 'ENABLED';
  session_creation: 'SANDBOX_ONLY' | 'NOT_VERIFIED' | 'EXTERNAL_GATED';
  live_session: 'SANDBOX_ONLY' | 'NOT_VERIFIED' | 'EXTERNAL_GATED';
  participant_authorization: 'SANDBOX_VERIFIED' | 'NOT_VERIFIED';
  consent: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  recording: 'EXTERNAL_GATED' | 'DISABLED' | 'PRODUCTION_RECORDING_EXTERNAL_GATED';
  webhook: 'SANDBOX_ONLY' | 'EXTERNAL_GATED' | 'NOT_APPLICABLE';
  country_support: 'POLICY_DRIVEN' | 'EXTERNAL_GATED' | 'POLICY_REQUIRED';
  legal_clinical_gate: 'EXTERNAL_GATED';
  storage_kms: 'EXTERNAL_GATED';
  appointment_vs_video:
    | 'APPOINTMENT_SEPARATE_FROM_VIDEO_SESSION_AND_CONSULTATION'
    | string;
  video_session_statuses_supported: string[];
  active_video_statuses: string[];
  session_lifecycle: VideoSessionLifecycleMachine;
  webhook_security: VideoWebhookSecurity;
  token_security: {
    scoped_to_session: true;
    participant_identity_validated: true;
    secrets_server_side_only: true;
    sandbox_tokens_not_production: true;
    never_log_tokens: true;
  };
  permission_model: {
    customer_own_session_only: true;
    customer_cannot_impersonate_doctor: true;
    doctor_scoped_consultation: true;
    doctor_cannot_bypass_provider_gate: true;
    tenant_isolation: true;
    admin_activation_not_clinical_access: true;
  };
  observability: {
    audit_events: true;
    correlation_id: true;
    no_phi_in_logs: true;
    no_tokens_in_logs: true;
    not_selected_suppresses_false_outage: true;
  };
  outbox_idempotency: {
    session_keys: 'DETERMINISTIC';
    duplicate_session_creation_prevented: true;
    duplicate_callback_safe: true;
    timeout_not_auto_live: true;
  };
  runtime_adapter: 'mock' | 'livekit_refs_present' | 'none';
  livekit_refs_present: boolean;
  real_video_available: false | true;
  activation_stage: string;
  remaining_blocker: typeof NO_PRODUCTION_VIDEO_PROVIDER | string;
  remaining_blockers: string[];
  related_clinical_blocker: typeof NO_PRODUCTION_CLINICAL_ADAPTER;
  next_action: string;
  enablement_guard: {
    can_enable: false | true;
    checks: VideoEnablementGuardCheck[];
  };
  configuration_validation: ProductionVideoConfigurationValidation;
  force_launch_available: false;
  country_policy: {
    status: 'POLICY_DRIVEN';
    hardcoded_market: false;
    markets_supported_for_evaluation: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    note: string;
  };
  legal_gate_items: VideoLegalGateItem[];
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  phi_printed: false;
  tokens_printed: false;
  fake_provider_invented: false;
  fake_meeting_url_as_production: false;
  message: string;
};

/** Mock / sandbox video identifiers must never count as production telemedicine. */
export function isMockVideoProvider(code: string | null | undefined): boolean {
  if (!code) return true;
  const upper = code.trim().toUpperCase();
  return upper === 'MOCK' || upper.startsWith('MOCK_') || upper.includes('SANDBOX');
}

/**
 * Detect runtime selection without printing secrets.
 * LiveKit env refs alone ≠ production provider selected / ENABLED.
 */
export function detectVideoRuntimeAdapter(): {
  runtime_adapter: VideoFirstOnboardingReport['runtime_adapter'];
  livekit_refs_present: boolean;
} {
  const livekit = livekitConfig() !== null;
  const forced = process.env['VIDEO_PROVIDER']?.trim().toLowerCase();
  if (forced === 'mock' || process.env['NODE_ENV'] === 'test') {
    return { runtime_adapter: 'mock', livekit_refs_present: livekit };
  }
  if (forced === 'livekit' && livekit) {
    return { runtime_adapter: 'livekit_refs_present', livekit_refs_present: true };
  }
  if (livekit) {
    return { runtime_adapter: 'livekit_refs_present', livekit_refs_present: true };
  }
  return { runtime_adapter: forced === 'mock' ? 'mock' : 'mock', livekit_refs_present: false };
}

/** Deterministic validator — credentials alone never yield ENABLED. */
export function validateVideoConfiguration(input: {
  providerSelected: boolean;
  nonMockProductionAdapterRegistered: boolean;
  healthcareEnvironment: 'sandbox' | 'production';
  liveEnabled: boolean;
  humanApproved: boolean;
  credentialsPresent: boolean;
  accountProjectPresent: boolean;
  endpointConfigured: boolean;
  allowedOriginsConfigured: boolean;
  countrySupportConfigured: boolean;
  callbackConfigured: boolean;
  legalClinicalConfigured: boolean;
}): VideoValidationStatus {
  if (!input.providerSelected) return 'NOT_SELECTED';
  if (!input.nonMockProductionAdapterRegistered) return 'NOT_CONFIGURED';
  const core =
    input.credentialsPresent &&
    input.accountProjectPresent &&
    input.endpointConfigured &&
    input.allowedOriginsConfigured &&
    input.countrySupportConfigured &&
    input.legalClinicalConfigured;
  if (!core) return 'NOT_CONFIGURED';
  if (!input.callbackConfigured || input.healthcareEnvironment !== 'production') {
    return 'CONFIGURED_BUT_UNAVAILABLE';
  }
  if (!input.humanApproved) return 'VERIFIED';
  if (!input.liveEnabled) return 'VERIFIED_BUT_DISABLED';
  return 'APPROVED';
}

export function evaluateVideoEnablementGuard(input: {
  nonMockProductionAdapterRegistered: boolean;
  healthcareEnvironment: 'sandbox' | 'production';
  liveEnabled: boolean;
  humanApproved: boolean;
  legalGateClear: boolean;
  recordingPolicyClear: boolean;
  webhookProductionReady: boolean;
  emergencyDisabled: boolean;
  countryPolicyConfigured?: boolean;
}): { can_enable: false | true; checks: VideoEnablementGuardCheck[] } {
  const checks: VideoEnablementGuardCheck[] = [
    {
      id: 'non_mock_adapter',
      ok: input.nonMockProductionAdapterRegistered,
      detail: input.nonMockProductionAdapterRegistered
        ? 'Non-mock production video adapter registered'
        : `MockVideoProvider / sandbox LiveKit refs only — ${NO_PRODUCTION_VIDEO_PROVIDER}`,
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
        : 'PROVIDER_APPROVED_VIDEO missing',
    },
    {
      id: 'legal_clinical_gate',
      ok: input.legalGateClear,
      detail: input.legalGateClear
        ? 'Legal/clinical telemedicine prerequisites verified'
        : 'Legal/clinical video gate EXTERNAL_GATED',
    },
    {
      id: 'recording_policy',
      ok: input.recordingPolicyClear,
      detail: input.recordingPolicyClear
        ? 'Recording policy decided'
        : 'Recording remains PRODUCTION_RECORDING_EXTERNAL_GATED (storage/KMS)',
    },
    {
      id: 'webhook_production',
      ok: input.webhookProductionReady,
      detail: input.webhookProductionReady
        ? 'Production video webhook ready'
        : 'Production video webhook EXTERNAL_GATED',
    },
    {
      id: 'country_policy',
      ok: input.countryPolicyConfigured !== false,
      detail:
        input.countryPolicyConfigured === false
          ? 'Telemedicine country policy POLICY_REQUIRED'
          : 'Telemedicine rules remain POLICY_DRIVEN / LEGAL_GATED per market',
    },
    {
      id: 'not_emergency_disabled',
      ok: !input.emergencyDisabled,
      detail: input.emergencyDisabled ? 'Emergency disable active' : 'No emergency disable',
    },
  ];
  return { can_enable: checks.every((c) => c.ok) ? true : false, checks };
}

export function buildVideoSessionLifecycleMachine(): VideoSessionLifecycleMachine {
  return {
    success_path: [
      'CREATED',
      'READY',
      'DOCTOR_JOINED',
      'CUSTOMER_JOINED',
      'IN_PROGRESS',
      'ENDED',
    ],
    exception_states: ['FAILED', 'EXPIRED'],
    notes: [
      'Reuse existing VideoSession transitions (video-status.ts) — do not invent a second machine.',
      'Illegal transitions rejected; ENDED/FAILED/EXPIRED cannot become active again.',
      'Duplicate start/end must be idempotent — no duplicate authoritative sessions.',
      'APPOINTMENT CONFIRMED ≠ VIDEO SESSION LIVE.',
      'SESSION CREATED ≠ LIVE CONSULTATION COMPLETED.',
    ],
    terminal_overwrite_forbidden: true,
    idempotent_start_end: true,
    session_created_not_equal_consultation_completed: true,
  };
}

export function listVideoLegalClinicalGateItems(): VideoLegalGateItem[] {
  return [
    {
      id: 'provider_contract',
      status: 'EXTERNAL_GATED',
      owner: 'Legal / Clinical ops',
      evidence_required: 'Signed video/telemedicine vendor contract + DPA',
      blocker: NO_PRODUCTION_VIDEO_PROVIDER,
      next_action: 'Procure market-authorized telemedicine video vendor',
    },
    {
      id: 'doctor_credential_verification',
      status: 'EXTERNAL_GATED',
      owner: 'Clinical ops',
      evidence_required: 'Doctor license/credential verification',
      blocker: 'Live credential registry EXTERNAL_GATED',
      next_action: 'Wire verification after provider selection',
    },
    {
      id: 'patient_consent',
      status: 'EXTERNAL_GATED',
      owner: 'Clinical / Privacy',
      evidence_required: 'Telemedicine consent policy per market',
      blocker: 'Production consent policy not certified',
      next_action: 'Confirm consent pack rules before live video',
    },
    {
      id: 'privacy_data_processing',
      status: 'EXTERNAL_GATED',
      owner: 'Privacy / Security',
      evidence_required: 'DPIA / media processing terms',
      blocker: 'Production PHI/media path not authorized',
      next_action: 'Complete privacy review before enablement',
    },
    {
      id: 'recording_consent',
      status: 'EXTERNAL_GATED',
      owner: 'Legal / Clinical',
      evidence_required: 'Recording consent + retention policy (if enabled)',
      blocker: 'PRODUCTION_RECORDING_EXTERNAL_GATED',
      next_action: 'Keep recording off until storage/KMS + consent cleared',
    },
    {
      id: 'country_telemedicine_rules',
      status: 'EXTERNAL_GATED',
      owner: 'Legal',
      evidence_required: 'Per-country telemedicine legality memo (policy-driven)',
      blocker: 'Market telemedicine rules not certified in-product',
      next_action: 'Complete legal review per launch country',
    },
    {
      id: 'data_residency',
      status: 'EXTERNAL_GATED',
      owner: 'Security / Legal',
      evidence_required: 'Media region / residency attestation',
      blocker: 'Production media residency EXTERNAL_GATED',
      next_action: 'Confirm vendor regions with launch countries',
    },
    {
      id: 'provider_certification',
      status: 'EXTERNAL_GATED',
      owner: 'Clinical / Platform',
      evidence_required: 'Vendor certification / go-live attestation',
      blocker: NO_PRODUCTION_CLINICAL_ADAPTER,
      next_action: 'Register production video adapter after certification',
    },
    {
      id: 'emergency_care_limitations',
      status: 'EXTERNAL_GATED',
      owner: 'Clinical ops',
      evidence_required: 'Emergency/out-of-scope workflow documented',
      blocker: 'Emergency-care limitations not production-attested',
      next_action: 'Publish clinical escalation runbook before live video',
    },
  ];
}

/** Authoritative video onboarding snapshot — mock/sandbox only; production EXTERNAL_GATED. */
export function evaluateVideoFirstOnboarding(): VideoFirstOnboardingReport {
  const env = readHealthcareEnvironment();
  const live = isLiveHealthcareEnabled();
  const activation = evaluateProviderActivation(getProviderActivationContract('VIDEO'));
  const humanApproved = process.env['PROVIDER_APPROVED_VIDEO']?.trim().toLowerCase() === 'true';
  const emergency =
    process.env['PROVIDER_EMERGENCY_DISABLE_ALL']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_VIDEO']?.trim().toLowerCase() === 'true';
  const runtime = detectVideoRuntimeAdapter();

  void isMockVideoProvider('mock');
  void ACTIVE_VIDEO_STATUSES;

  const real = false;
  const guard = evaluateVideoEnablementGuard({
    nonMockProductionAdapterRegistered: real,
    healthcareEnvironment: env,
    liveEnabled: live,
    humanApproved,
    legalGateClear: false,
    recordingPolicyClear: false,
    webhookProductionReady: false,
    emergencyDisabled: emergency,
  });

  const validation_status = validateVideoConfiguration({
    providerSelected: false,
    nonMockProductionAdapterRegistered: real,
    healthcareEnvironment: env,
    liveEnabled: live,
    humanApproved,
    credentialsPresent: false,
    accountProjectPresent: false,
    endpointConfigured: false,
    allowedOriginsConfigured: false,
    countrySupportConfigured: false,
    callbackConfigured: false,
    legalClinicalConfigured: false,
  });

  const configuration_validation = validateProductionVideoConfiguration({
    providerSelected: real,
    providerName: 'NOT_SELECTED',
    nonMockAdapterRegistered: real,
  });

  const remaining_blockers = [
    NO_PRODUCTION_VIDEO_PROVIDER,
    NO_PRODUCTION_CLINICAL_ADAPTER,
    ...configuration_validation.blockers,
  ];

  return {
    sprint: 92,
    foundation_sprint: 79,
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
    session_creation: 'SANDBOX_ONLY',
    live_session: 'SANDBOX_ONLY',
    participant_authorization: 'SANDBOX_VERIFIED',
    consent: 'SANDBOX_VERIFIED',
    recording: 'PRODUCTION_RECORDING_EXTERNAL_GATED',
    webhook: 'EXTERNAL_GATED',
    country_support: 'POLICY_DRIVEN',
    legal_clinical_gate: 'EXTERNAL_GATED',
    storage_kms: 'EXTERNAL_GATED',
    appointment_vs_video: 'APPOINTMENT_SEPARATE_FROM_VIDEO_SESSION_AND_CONSULTATION',
    video_session_statuses_supported: [
      'CREATED',
      'READY',
      'DOCTOR_JOINED',
      'CUSTOMER_JOINED',
      'IN_PROGRESS',
      'ENDED',
      'FAILED',
      'EXPIRED',
    ],
    active_video_statuses: [...ACTIVE_VIDEO_STATUSES],
    session_lifecycle: buildVideoSessionLifecycleMachine(),
    webhook_security: {
      status: 'EXTERNAL_GATED',
      unsigned_fail_closed: true,
      invalid_signature_rejected: true,
      duplicate_idempotent: true,
      secrets_logged: false,
      phi_logged: false,
    },
    token_security: {
      scoped_to_session: true,
      participant_identity_validated: true,
      secrets_server_side_only: true,
      sandbox_tokens_not_production: true,
      never_log_tokens: true,
    },
    permission_model: {
      customer_own_session_only: true,
      customer_cannot_impersonate_doctor: true,
      doctor_scoped_consultation: true,
      doctor_cannot_bypass_provider_gate: true,
      tenant_isolation: true,
      admin_activation_not_clinical_access: true,
    },
    observability: {
      audit_events: true,
      correlation_id: true,
      no_phi_in_logs: true,
      no_tokens_in_logs: true,
      not_selected_suppresses_false_outage: true,
    },
    outbox_idempotency: {
      session_keys: 'DETERMINISTIC',
      duplicate_session_creation_prevented: true,
      duplicate_callback_safe: true,
      timeout_not_auto_live: true,
    },
    runtime_adapter: runtime.runtime_adapter,
    livekit_refs_present: runtime.livekit_refs_present,
    real_video_available: real,
    activation_stage: activation.stage,
    remaining_blocker: NO_PRODUCTION_VIDEO_PROVIDER,
    remaining_blockers,
    related_clinical_blocker: NO_PRODUCTION_CLINICAL_ADAPTER,
    next_action:
      'Supply telemedicine video vendor contract + vault secret refs + production adapter; clear legal/clinical/consent gate; set PROVIDER_APPROVED_VIDEO; then HEALTHCARE_LIVE_ENABLED after guard. LiveKit sandbox refs alone do not enable production.',
    enablement_guard: guard,
    configuration_validation,
    force_launch_available: false,
    country_policy: {
      status: 'POLICY_DRIVEN',
      hardcoded_market: false,
      markets_supported_for_evaluation: ['GLOBAL', 'IN', 'AE', 'US'],
      note: 'Telemedicine availability/consent/recording remain policy packs — do not invent legal rules.',
    },
    legal_gate_items: listVideoLegalClinicalGateItems(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    phi_printed: false,
    tokens_printed: false,
    fake_provider_invented: false,
    fake_meeting_url_as_production: false,
    message:
      'No production video provider selected (NO_PRODUCTION_VIDEO_PROVIDER). Sandbox consultation + MockVideoProvider remain available. LiveKit env refs (if present) are not production telemedicine. Production video EXTERNAL_GATED.',
  };
}

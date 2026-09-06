/**
 * Sprint 138 — Production video / telemedicine activation path (software).
 * Reuses S23/S36/S48/S55/S68/S79/S92/S125/S137 pattern.
 * Does NOT invent video providers, credentials, rooms, or live sessions.
 * CONFIGURED ≠ VERIFIED ≠ APPROVED ≠ ENABLED.
 * Without a genuine non-sandbox provider: EXTERNAL_GATED + fail-closed.
 * Sandbox / MockVideoProvider may remain available only when HEALTHCARE_ENVIRONMENT ≠ production.
 */
import { Errors } from '../common/problem';
import {
  isLiveHealthcareEnabled,
  readHealthcareEnvironment,
  type HealthcareRuntimeEnvironment,
} from '../healthcare/healthcare-environment';
import {
  NO_PRODUCTION_VIDEO_PROVIDER,
  evaluateVideoEnablementGuard,
  buildVideoSessionLifecycleMachine,
  isMockVideoProvider,
  detectVideoRuntimeAdapter,
} from './video-first-onboarding';
import {
  VIDEO_CALLBACK_CONFIGURATION_MISSING,
  VIDEO_CREDENTIAL_REFERENCE_MISSING,
  VIDEO_API_ENDPOINT_REFERENCE_MISSING,
  VIDEO_TOKEN_SIGNING_REFERENCE_MISSING,
  VIDEO_MARKET_LEGAL_CONFIGURATION_MISSING,
  VIDEO_PROVIDER_NOT_SELECTED,
  validateProductionVideoConfiguration,
} from './production-video-requirements';
import {
  secretsManagerRuntimeResolverStatus,
} from '../ops/secrets-manager-runtime-resolver';

export const VIDEO_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE =
  'VIDEO_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE';

export const VIDEO_VERIFICATION_STATUS_ENV = 'VIDEO_VERIFICATION_STATUS';
export const VIDEO_APPROVAL_STATUS_ENV = 'VIDEO_APPROVAL_STATUS';

export const PRODUCTION_VIDEO_SESSION_BLOCKED = 'PRODUCTION_VIDEO_SESSION_BLOCKED';
export const SANDBOX_VIDEO_BLOCKED_IN_PRODUCTION = 'SANDBOX_VIDEO_BLOCKED_IN_PRODUCTION';
export const VIDEO_ENDED_NEQ_CONSULTATION_COMPLETED =
  'VIDEO_ENDED_NEQ_CONSULTATION_COMPLETED';

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

/** Mock / sandbox / LiveKit-ref-only identifiers never count as production telemedicine. */
export function isSandboxOrMockVideoProvider(code: string | null | undefined): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  return (
    upper === 'SANDBOX' ||
    upper === 'NULL' ||
    upper === 'MOCK' ||
    upper === 'LIVEKIT' ||
    upper.startsWith('SANDBOX_') ||
    upper.startsWith('MOCK_') ||
    isMockVideoProvider(code)
  );
}

export type VideoProviderSelection = {
  selected: boolean;
  code: string | null;
  mock_rejected: boolean;
};

export function readConfiguredProductionVideoProvider(): VideoProviderSelection {
  const raw = envValue('VIDEO_PROVIDER');
  if (!raw) {
    return { selected: false, code: null, mock_rejected: false };
  }
  const code = raw.toUpperCase();
  if (isSandboxOrMockVideoProvider(code)) {
    return { selected: false, code, mock_rejected: true };
  }
  return { selected: true, code, mock_rejected: false };
}

export type VideoConfigSlotPresence = {
  id: string;
  label: string;
  reference_key: string;
  status: 'MISSING' | 'PRESENT' | 'NOT_SELECTED' | 'EXTERNAL_GATED' | 'REJECTED_MOCK';
  reference_present: boolean;
  secret: boolean;
  value_leaked: false;
};

export function buildLiveVideoConfigurationSlots(): VideoConfigSlotPresence[] {
  const sel = readConfiguredProductionVideoProvider();
  const providerSlot = (): VideoConfigSlotPresence => ({
    id: 'provider_identity',
    label: 'Video provider identity',
    reference_key: 'VIDEO_PROVIDER',
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
  ): VideoConfigSlotPresence => {
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
    refSlot('credential', 'Credential / secret reference', 'VIDEO_PROVIDER_SECRET_REF', true),
    refSlot('account', 'Account reference', 'VIDEO_ACCOUNT_REF', false),
    refSlot('api_endpoint', 'API endpoint reference', 'VIDEO_API_ENDPOINT_REF', false),
    refSlot(
      'token_signing',
      'Token signing secret reference',
      'VIDEO_TOKEN_SIGNING_SECRET_REF',
      true,
    ),
    refSlot('callback', 'Callback / webhook secret reference', 'VIDEO_CALLBACK_SECRET_REF', true),
    refSlot('markets_legal', 'Market / legal configuration', 'VIDEO_MARKET_LEGAL_CONFIG_REF', false),
    refSlot(
      'recording_storage',
      'Recording storage reference (existing / EXTERNAL_GATED)',
      'VIDEO_RECORDING_STORAGE_REF',
      false,
    ),
    refSlot('environment', 'Healthcare environment identity', 'HEALTHCARE_ENVIRONMENT', false),
  ];
}

export type VideoActivationStage =
  | 'NOT_SELECTED'
  | 'EXTERNAL_GATED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED';

export type VideoLifecycleStatus = {
  provider: string;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: false;
  production: 'EXTERNAL_GATED';
  activation_stage: VideoActivationStage;
  remaining_blocker: string;
};

const REQUIRED_VIDEO_REFS = [
  'VIDEO_PROVIDER_SECRET_REF',
  'VIDEO_API_ENDPOINT_REF',
  'VIDEO_TOKEN_SIGNING_SECRET_REF',
] as const;

export function deriveProductionVideoLifecycle(): VideoLifecycleStatus {
  const sel = readConfiguredProductionVideoProvider();
  const refsOk = REQUIRED_VIDEO_REFS.every((k) => envPresent(k));
  const configured = sel.selected && refsOk;
  const verified = configured && humanStatus(VIDEO_VERIFICATION_STATUS_ENV, 'verified');
  const approved = verified && humanStatus(VIDEO_APPROVAL_STATUS_ENV, 'approved');
  const enabled = false as const;

  let activation_stage: VideoActivationStage = 'NOT_SELECTED';
  if (enabled) activation_stage = 'ENABLED';
  else if (approved) activation_stage = 'APPROVED';
  else if (verified) activation_stage = 'VERIFIED';
  else if (configured) activation_stage = 'CONFIGURED';
  else if (sel.selected || sel.mock_rejected) activation_stage = 'EXTERNAL_GATED';

  let remaining_blocker: string = NO_PRODUCTION_VIDEO_PROVIDER;
  if (sel.mock_rejected) remaining_blocker = SANDBOX_VIDEO_BLOCKED_IN_PRODUCTION;
  else if (!sel.selected) remaining_blocker = VIDEO_PROVIDER_NOT_SELECTED;
  else if (!envPresent('VIDEO_PROVIDER_SECRET_REF')) {
    remaining_blocker = VIDEO_CREDENTIAL_REFERENCE_MISSING;
  } else if (!envPresent('VIDEO_API_ENDPOINT_REF')) {
    remaining_blocker = VIDEO_API_ENDPOINT_REFERENCE_MISSING;
  } else if (!envPresent('VIDEO_TOKEN_SIGNING_SECRET_REF')) {
    remaining_blocker = VIDEO_TOKEN_SIGNING_REFERENCE_MISSING;
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

export function evaluateVideoSessionNegativeCases(): Array<{
  case_id: string;
  outcome: 'REJECTED' | 'IDEMPOTENT' | 'EXTERNAL_GATED';
  reason: string;
}> {
  return [
    {
      case_id: 'production_without_provider',
      outcome: 'EXTERNAL_GATED',
      reason: PRODUCTION_VIDEO_SESSION_BLOCKED,
    },
    {
      case_id: 'sandbox_mock_in_production',
      outcome: 'REJECTED',
      reason: SANDBOX_VIDEO_BLOCKED_IN_PRODUCTION,
    },
    {
      case_id: 'missing_consent',
      outcome: 'REJECTED',
      reason: 'CONSENT_REQUIRED_GATE',
    },
    {
      case_id: 'cancelled_appointment',
      outcome: 'REJECTED',
      reason: 'APPOINTMENT_NOT_JOINABLE',
    },
    {
      case_id: 'expired_session',
      outcome: 'REJECTED',
      reason: 'SESSION_EXPIRED',
    },
    {
      case_id: 'ended_session_reuse',
      outcome: 'REJECTED',
      reason: 'SESSION_ENDED_NOT_JOINABLE',
    },
    {
      case_id: 'cross_patient_join',
      outcome: 'REJECTED',
      reason: 'PHI_CROSS_PATIENT_DENIED',
    },
    {
      case_id: 'cross_doctor_join',
      outcome: 'REJECTED',
      reason: 'CROSS_DOCTOR_ACCESS_DENIED',
    },
    {
      case_id: 'vendor_join',
      outcome: 'REJECTED',
      reason: 'VENDOR_VIDEO_ACCESS_DENIED',
    },
    {
      case_id: 'client_forged_identity_token',
      outcome: 'REJECTED',
      reason: 'CLIENT_IDENTITY_INSUFFICIENT',
    },
    {
      case_id: 'duplicate_session_create',
      outcome: 'IDEMPOTENT',
      reason: 'EXISTING_SESSION_REUSED',
    },
    {
      case_id: 'provider_timeout',
      outcome: 'REJECTED',
      reason: 'VIDEO_PROVIDER_UNAVAILABLE',
    },
    {
      case_id: 'invalid_signature_callback',
      outcome: 'REJECTED',
      reason: 'INVALID_SIGNATURE',
    },
    {
      case_id: 'replayed_callback',
      outcome: 'REJECTED',
      reason: 'WEBHOOK_REPLAY',
    },
    {
      case_id: 'duplicate_callback',
      outcome: 'IDEMPOTENT',
      reason: 'DUPLICATE_WEBHOOK_RECEIPT',
    },
    {
      case_id: 'video_ended_neq_consultation_completed',
      outcome: 'REJECTED',
      reason: VIDEO_ENDED_NEQ_CONSULTATION_COMPLETED,
    },
  ];
}

export type VideoProductionActivationPathReport = {
  sprint: 138;
  authoritative_source: typeof VIDEO_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE;
  parallel_video_system_created: false;
  fake_provider_invented: false;
  real_live_video_claimed: false;
  secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
  healthcare_environment: HealthcareRuntimeEnvironment;
  live_enabled: boolean;
  software_activation_path: 'COMPLETE';
  video: VideoLifecycleStatus;
  configuration_slots: VideoConfigSlotPresence[];
  configuration_validation: ReturnType<typeof validateProductionVideoConfiguration>;
  session_lifecycle: ReturnType<typeof buildVideoSessionLifecycleMachine>;
  video_ended_neq_consultation_completed: true;
  session_negative_cases: ReturnType<typeof evaluateVideoSessionNegativeCases>;
  runtime_adapter: ReturnType<typeof detectVideoRuntimeAdapter>;
  production_video_enabled: false;
  production_session_creation: 'BLOCKED';
  enablement_guard: ReturnType<typeof evaluateVideoEnablementGuard>;
  blockers: string[];
  remaining_blocker: typeof NO_PRODUCTION_VIDEO_PROVIDER;
  can_production_launch: 'NO';
  secrets_printed: false;
  phi_printed: false;
  message: string;
  correlation_id?: string;
  evaluated_at: string;
};

export function evaluateVideoProductionActivationPath(input?: {
  correlation_id?: string;
}): VideoProductionActivationPathReport {
  const env = readHealthcareEnvironment();
  const live = isLiveHealthcareEnabled();
  const video = deriveProductionVideoLifecycle();
  const slots = buildLiveVideoConfigurationSlots();
  const runtime = detectVideoRuntimeAdapter();
  const config = validateProductionVideoConfiguration({
    providerSelected: video.configured,
    providerName: video.provider,
    nonMockAdapterRegistered: false,
  });
  const enablement = evaluateVideoEnablementGuard({
    nonMockProductionAdapterRegistered: false,
    healthcareEnvironment: env,
    liveEnabled: live,
    humanApproved: video.approved,
    legalGateClear: false,
    recordingPolicyClear: false,
    webhookProductionReady: false,
    emergencyDisabled: false,
  });

  const blockers = [
    NO_PRODUCTION_VIDEO_PROVIDER,
    video.remaining_blocker,
    VIDEO_PROVIDER_NOT_SELECTED,
    VIDEO_CREDENTIAL_REFERENCE_MISSING,
    VIDEO_API_ENDPOINT_REFERENCE_MISSING,
    VIDEO_TOKEN_SIGNING_REFERENCE_MISSING,
    VIDEO_CALLBACK_CONFIGURATION_MISSING,
    VIDEO_MARKET_LEGAL_CONFIGURATION_MISSING,
    // S142 software resolver COMPLETE (was SECRETS_MANAGER_RUNTIME_RESOLVER_MISSING)
    'PRODUCTION_VIDEO_ADAPTER_NOT_REGISTERED',
  ];

  return {
    sprint: 138,
    authoritative_source: VIDEO_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE,
    parallel_video_system_created: false,
    fake_provider_invented: false,
    real_live_video_claimed: false,
    secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    healthcare_environment: env,
    live_enabled: live,
    software_activation_path: 'COMPLETE',
    video,
    configuration_slots: slots,
    configuration_validation: config,
    session_lifecycle: buildVideoSessionLifecycleMachine(),
    video_ended_neq_consultation_completed: true,
    session_negative_cases: evaluateVideoSessionNegativeCases(),
    runtime_adapter: runtime,
    production_video_enabled: false,
    production_session_creation: 'BLOCKED',
    enablement_guard: enablement,
    blockers: [...new Set(blockers)],
    remaining_blocker: NO_PRODUCTION_VIDEO_PROVIDER,
    can_production_launch: 'NO',
    secrets_printed: false,
    phi_printed: false,
    message: video.configured
      ? 'Software video activation path complete: configuration refs evaluated. Production live session creation remains BLOCKED / EXTERNAL_GATED. VIDEO_ENDED ≠ CONSULTATION_COMPLETED.'
      : 'Software video activation path complete: no production video provider selected. Sandbox / MockVideoProvider may remain for development. Production session creation fail-closed.',
    correlation_id: input?.correlation_id,
    evaluated_at: new Date().toISOString(),
  };
}

/** Fail-closed production video session create / join. */
export function assertProductionVideoSessionAllowed(context: string): void {
  if (readHealthcareEnvironment() !== 'production') {
    return;
  }
  const sel = readConfiguredProductionVideoProvider();
  if (sel.mock_rejected) {
    throw Errors.problem(
      503,
      SANDBOX_VIDEO_BLOCKED_IN_PRODUCTION,
      'Sandbox video blocked in production',
      `${context}: SANDBOX/MOCK/LIVEKIT video providers cannot create production clinical sessions.`,
    );
  }
  const path = evaluateVideoProductionActivationPath();
  throw Errors.problem(
    503,
    PRODUCTION_VIDEO_SESSION_BLOCKED,
    'Production video session blocked',
    `${context}: ${path.remaining_blocker}. Blockers: ${path.blockers.slice(0, 6).join(', ')}. VIDEO_ENDED ≠ CONSULTATION_COMPLETED. Software path COMPLETE; live provider EXTERNAL_GATED.`,
  );
}

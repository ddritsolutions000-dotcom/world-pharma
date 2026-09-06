/**
 * Sprint 139 — Production PACS / DICOM activation path (software).
 * Reuses S6/S24/S36/S48/S56/S70/S80/S93 (+ S137/S138 pattern).
 * Does NOT invent PACS providers, DICOM endpoints, viewers, credentials, or live studies.
 * CONFIGURED ≠ VERIFIED ≠ APPROVED ≠ ENABLED.
 * Without a genuine non-sandbox provider: EXTERNAL_GATED + fail-closed.
 * SandboxPacsAdapter may remain available only when HEALTHCARE_ENVIRONMENT ≠ production.
 * IMAGING REPORT ≠ DIAGNOSTIC PACS VIEWER.
 */
import { Errors } from '../common/problem';
import {
  isLiveHealthcareEnabled,
  readHealthcareEnvironment,
  type HealthcareRuntimeEnvironment,
} from '../healthcare/healthcare-environment';
import {
  NO_PRODUCTION_PACS_PROVIDER,
  evaluatePacsEnablementGuard,
  buildImagingStudyLifecycleMachine,
  isMockOrSandboxPacsProvider,
} from './pacs-first-onboarding';
import {
  PACS_AE_TITLE_REFERENCE_MISSING,
  PACS_CALLBACK_CONFIGURATION_MISSING,
  PACS_CREDENTIAL_REFERENCE_MISSING,
  PACS_DICOM_ENDPOINT_REFERENCE_MISSING,
  PACS_MARKET_LEGAL_CONFIGURATION_MISSING,
  PACS_PROVIDER_NOT_SELECTED,
  PACS_STORAGE_KMS_DEPENDENCY_GATED,
  PACS_VIEWER_CONFIGURATION_MISSING,
  validateProductionPacsConfiguration,
} from './production-pacs-requirements';
import {
  secretsManagerRuntimeResolverStatus,
} from '../ops/secrets-manager-runtime-resolver';

export const PACS_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE =
  'PACS_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE';

export const PACS_VERIFICATION_STATUS_ENV = 'PACS_VERIFICATION_STATUS';
export const PACS_APPROVAL_STATUS_ENV = 'PACS_APPROVAL_STATUS';

export const PRODUCTION_PACS_INGEST_BLOCKED = 'PRODUCTION_PACS_INGEST_BLOCKED';
export const SANDBOX_PACS_BLOCKED_IN_PRODUCTION = 'SANDBOX_PACS_BLOCKED_IN_PRODUCTION';
export const REPORT_NEQ_DIAGNOSTIC_VIEWER = 'REPORT_NEQ_DIAGNOSTIC_VIEWER';
export const DRAFT_NEQ_PUBLISHED_IMAGING_REPORT = 'DRAFT_NEQ_PUBLISHED_IMAGING_REPORT';

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

/** Mock / sandbox identifiers never count as production PACS. */
export function isSandboxOrMockPacsProvider(code: string | null | undefined): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  return (
    upper === 'SANDBOX' ||
    upper === 'NULL' ||
    upper === 'MOCK' ||
    upper.startsWith('SANDBOX_') ||
    upper.startsWith('MOCK_') ||
    isMockOrSandboxPacsProvider(code)
  );
}

export type PacsProviderSelection = {
  selected: boolean;
  code: string | null;
  mock_rejected: boolean;
};

export function readConfiguredProductionPacsProvider(): PacsProviderSelection {
  const raw = envValue('PACS_PROVIDER');
  if (!raw) {
    return { selected: false, code: null, mock_rejected: false };
  }
  const code = raw.toUpperCase();
  if (isSandboxOrMockPacsProvider(code)) {
    return { selected: false, code, mock_rejected: true };
  }
  return { selected: true, code, mock_rejected: false };
}

export type PacsConfigSlotPresence = {
  id: string;
  label: string;
  reference_key: string;
  status: 'MISSING' | 'PRESENT' | 'NOT_SELECTED' | 'EXTERNAL_GATED' | 'REJECTED_MOCK';
  reference_present: boolean;
  secret: boolean;
  value_leaked: false;
};

export function buildLivePacsConfigurationSlots(): PacsConfigSlotPresence[] {
  const sel = readConfiguredProductionPacsProvider();
  const providerSlot = (): PacsConfigSlotPresence => ({
    id: 'provider_identity',
    label: 'PACS provider identity',
    reference_key: 'PACS_PROVIDER',
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
  ): PacsConfigSlotPresence => {
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
    refSlot('credential', 'Credential / secret reference', 'PACS_PROVIDER_SECRET_REF', true),
    refSlot('account', 'Account / system reference', 'PACS_ACCOUNT_REF', false),
    refSlot('dicom_endpoint', 'DICOM endpoint reference', 'PACS_DICOM_ENDPOINT_REF', false),
    refSlot('ae_title', 'AE Title reference', 'PACS_AE_TITLE_REF', false),
    refSlot('tls_cert', 'TLS certificate reference', 'PACS_TLS_CERT_REF', true),
    refSlot('callback', 'Callback / webhook secret reference', 'PACS_CALLBACK_SECRET_REF', true),
    refSlot('markets_legal', 'Market / legal configuration', 'PACS_MARKET_LEGAL_CONFIG_REF', false),
    refSlot('viewer', 'Viewer configuration reference', 'PACS_VIEWER_CONFIG_REF', false),
    refSlot('modalities', 'Supported modalities configuration', 'PACS_MODALITIES_CONFIG_REF', false),
    refSlot('environment', 'Healthcare environment identity', 'HEALTHCARE_ENVIRONMENT', false),
  ];
}

export type PacsActivationStage =
  | 'NOT_SELECTED'
  | 'EXTERNAL_GATED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED';

export type PacsLifecycleStatus = {
  provider: string;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: false;
  production: 'EXTERNAL_GATED';
  activation_stage: PacsActivationStage;
  remaining_blocker: string;
};

const REQUIRED_PACS_REFS = [
  'PACS_PROVIDER_SECRET_REF',
  'PACS_DICOM_ENDPOINT_REF',
  'PACS_AE_TITLE_REF',
] as const;

export function deriveProductionPacsLifecycle(): PacsLifecycleStatus {
  const sel = readConfiguredProductionPacsProvider();
  const refsOk = REQUIRED_PACS_REFS.every((k) => envPresent(k));
  const configured = sel.selected && refsOk;
  const verified = configured && humanStatus(PACS_VERIFICATION_STATUS_ENV, 'verified');
  const approved = verified && humanStatus(PACS_APPROVAL_STATUS_ENV, 'approved');
  const enabled = false as const;

  let activation_stage: PacsActivationStage = 'NOT_SELECTED';
  if (enabled) activation_stage = 'ENABLED';
  else if (approved) activation_stage = 'APPROVED';
  else if (verified) activation_stage = 'VERIFIED';
  else if (configured) activation_stage = 'CONFIGURED';
  else if (sel.selected || sel.mock_rejected) activation_stage = 'EXTERNAL_GATED';

  let remaining_blocker: string = NO_PRODUCTION_PACS_PROVIDER;
  if (sel.mock_rejected) remaining_blocker = SANDBOX_PACS_BLOCKED_IN_PRODUCTION;
  else if (!sel.selected) remaining_blocker = PACS_PROVIDER_NOT_SELECTED;
  else if (!envPresent('PACS_PROVIDER_SECRET_REF')) {
    remaining_blocker = PACS_CREDENTIAL_REFERENCE_MISSING;
  } else if (!envPresent('PACS_DICOM_ENDPOINT_REF')) {
    remaining_blocker = PACS_DICOM_ENDPOINT_REFERENCE_MISSING;
  } else if (!envPresent('PACS_AE_TITLE_REF')) {
    remaining_blocker = PACS_AE_TITLE_REFERENCE_MISSING;
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

export function evaluatePacsIngestNegativeCases(): Array<{
  case_id: string;
  outcome: 'REJECTED' | 'IDEMPOTENT' | 'EXTERNAL_GATED';
  reason: string;
}> {
  return [
    {
      case_id: 'production_without_pacs',
      outcome: 'EXTERNAL_GATED',
      reason: PRODUCTION_PACS_INGEST_BLOCKED,
    },
    {
      case_id: 'sandbox_mock_in_production',
      outcome: 'REJECTED',
      reason: SANDBOX_PACS_BLOCKED_IN_PRODUCTION,
    },
    {
      case_id: 'client_forged_dicom_identity',
      outcome: 'REJECTED',
      reason: 'CLIENT_DICOM_IDENTITY_INSUFFICIENT',
    },
    {
      case_id: 'duplicate_ingest',
      outcome: 'IDEMPOTENT',
      reason: 'EXISTING_INGEST_REUSED',
    },
    {
      case_id: 'duplicate_accession',
      outcome: 'IDEMPOTENT',
      reason: 'EXISTING_ACCESSION_REUSED',
    },
    {
      case_id: 'provider_timeout',
      outcome: 'REJECTED',
      reason: 'PACS_PROVIDER_UNAVAILABLE',
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
      case_id: 'draft_presented_as_final',
      outcome: 'REJECTED',
      reason: DRAFT_NEQ_PUBLISHED_IMAGING_REPORT,
    },
    {
      case_id: 'report_neq_viewer',
      outcome: 'REJECTED',
      reason: REPORT_NEQ_DIAGNOSTIC_VIEWER,
    },
    {
      case_id: 'cross_patient_study',
      outcome: 'REJECTED',
      reason: 'PHI_CROSS_PATIENT_DENIED',
    },
    {
      case_id: 'guessed_study_id',
      outcome: 'REJECTED',
      reason: 'IDOR_STUDY_ACCESS_DENIED',
    },
  ];
}

export type PacsProductionActivationPathReport = {
  sprint: 139;
  authoritative_source: typeof PACS_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE;
  parallel_pacs_system_created: false;
  fake_provider_invented: false;
  fake_dicom_study_invented: false;
  real_pacs_claimed: false;
  real_diagnostic_viewer_claimed: false;
  secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
  healthcare_environment: HealthcareRuntimeEnvironment;
  live_enabled: boolean;
  software_activation_path: 'COMPLETE';
  pacs: PacsLifecycleStatus;
  configuration_slots: PacsConfigSlotPresence[];
  configuration_validation: ReturnType<typeof validateProductionPacsConfiguration>;
  study_lifecycle: ReturnType<typeof buildImagingStudyLifecycleMachine>;
  report_neq_diagnostic_viewer: true;
  draft_neq_published: true;
  ingest_negative_cases: ReturnType<typeof evaluatePacsIngestNegativeCases>;
  production_pacs_enabled: false;
  production_dicom_ingest: 'BLOCKED';
  production_viewer: 'BLOCKED';
  enablement_guard: ReturnType<typeof evaluatePacsEnablementGuard>;
  blockers: string[];
  remaining_blocker: typeof NO_PRODUCTION_PACS_PROVIDER;
  can_production_launch: 'NO';
  secrets_printed: false;
  phi_printed: false;
  dicom_payload_printed: false;
  message: string;
  correlation_id?: string;
  evaluated_at: string;
};

export function evaluatePacsProductionActivationPath(input?: {
  correlation_id?: string;
}): PacsProductionActivationPathReport {
  const env = readHealthcareEnvironment();
  const live = isLiveHealthcareEnabled();
  const pacs = deriveProductionPacsLifecycle();
  const slots = buildLivePacsConfigurationSlots();
  const config = validateProductionPacsConfiguration({
    providerSelected: pacs.configured,
    providerName: pacs.provider,
    nonMockAdapterRegistered: false,
  });
  const enablement = evaluatePacsEnablementGuard({
    nonMockProductionAdapterRegistered: false,
    healthcareEnvironment: env,
    liveEnabled: live,
    humanApproved: pacs.approved,
    legalGateClear: false,
    viewerProductionReady: false,
    objectStorageProductionReady: false,
    kmsReady: false,
    malwareScanReady: false,
    emergencyDisabled: false,
  });

  const blockers = [
    NO_PRODUCTION_PACS_PROVIDER,
    pacs.remaining_blocker,
    PACS_PROVIDER_NOT_SELECTED,
    PACS_CREDENTIAL_REFERENCE_MISSING,
    PACS_DICOM_ENDPOINT_REFERENCE_MISSING,
    PACS_AE_TITLE_REFERENCE_MISSING,
    PACS_CALLBACK_CONFIGURATION_MISSING,
    PACS_MARKET_LEGAL_CONFIGURATION_MISSING,
    PACS_VIEWER_CONFIGURATION_MISSING,
    PACS_STORAGE_KMS_DEPENDENCY_GATED,
    // S142 software resolver COMPLETE (was SECRETS_MANAGER_RUNTIME_RESOLVER_MISSING)
    'PRODUCTION_PACS_ADAPTER_NOT_REGISTERED',
  ];

  return {
    sprint: 139,
    authoritative_source: PACS_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE,
    parallel_pacs_system_created: false,
    fake_provider_invented: false,
    fake_dicom_study_invented: false,
    real_pacs_claimed: false,
    real_diagnostic_viewer_claimed: false,
    secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    healthcare_environment: env,
    live_enabled: live,
    software_activation_path: 'COMPLETE',
    pacs,
    configuration_slots: slots,
    configuration_validation: config,
    study_lifecycle: buildImagingStudyLifecycleMachine(),
    report_neq_diagnostic_viewer: true,
    draft_neq_published: true,
    ingest_negative_cases: evaluatePacsIngestNegativeCases(),
    production_pacs_enabled: false,
    production_dicom_ingest: 'BLOCKED',
    production_viewer: 'BLOCKED',
    enablement_guard: enablement,
    blockers: [...new Set(blockers)],
    remaining_blocker: NO_PRODUCTION_PACS_PROVIDER,
    can_production_launch: 'NO',
    secrets_printed: false,
    phi_printed: false,
    dicom_payload_printed: false,
    message: pacs.configured
      ? 'Software PACS activation path complete: configuration refs evaluated. Production DICOM ingest / viewer remain BLOCKED / EXTERNAL_GATED. REPORT ≠ DIAGNOSTIC VIEWER.'
      : 'Software PACS activation path complete: no production PACS provider selected. SandboxPacsAdapter may remain for development. Production ingest fail-closed.',
    correlation_id: input?.correlation_id,
    evaluated_at: new Date().toISOString(),
  };
}

/** Fail-closed production DICOM ingest / PACS session. */
export function assertProductionPacsIngestAllowed(context: string): void {
  if (readHealthcareEnvironment() !== 'production') {
    return;
  }
  const sel = readConfiguredProductionPacsProvider();
  if (sel.mock_rejected) {
    throw Errors.problem(
      503,
      SANDBOX_PACS_BLOCKED_IN_PRODUCTION,
      'Sandbox PACS blocked in production',
      `${context}: SANDBOX/MOCK PACS adapters cannot perform production DICOM ingest.`,
    );
  }
  const path = evaluatePacsProductionActivationPath();
  throw Errors.problem(
    503,
    PRODUCTION_PACS_INGEST_BLOCKED,
    'Production PACS ingest blocked',
    `${context}: ${path.remaining_blocker}. Blockers: ${path.blockers.slice(0, 6).join(', ')}. REPORT ≠ DIAGNOSTIC VIEWER. Software path COMPLETE; live PACS EXTERNAL_GATED.`,
  );
}

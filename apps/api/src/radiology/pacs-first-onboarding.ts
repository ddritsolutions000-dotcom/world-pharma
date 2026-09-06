/**
 * Sprint 70 foundation + Sprint 80 readiness + Sprint 93 production PACS /
 * DICOM imaging activation readiness.
 * Never invent PACS vendors, DICOM servers, viewers, credentials, or live studies.
 * Never print secrets/PHI/DICOM payloads.
 *
 * Sandbox study metadata/report workflow ≠ production PACS / clinical image viewer.
 * IMAGING REPORT ≠ DIAGNOSTIC PACS VIEWER.
 */
import {
  isLiveHealthcareEnabled,
  readHealthcareEnvironment,
} from '../healthcare/healthcare-environment';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';
import {
  PACS_PROVIDER_NOT_SELECTED,
  validateProductionPacsConfiguration,
  type ProductionPacsConfigurationValidation,
} from './production-pacs-requirements';

/** Sprint 80/93 primary activation blocker (PACS rail). Never remove. */
export const NO_PRODUCTION_PACS_PROVIDER = 'NO_PRODUCTION_PACS_PROVIDER';
/** Historical adapter-gate code retained for enablement / S70 compat. */
export const NO_PRODUCTION_PACS_ADAPTER = 'NO_PRODUCTION_PACS_ADAPTER';

export {
  PACS_PROVIDER_NOT_SELECTED,
  PACS_CREDENTIAL_REFERENCE_MISSING,
  PACS_DICOM_ENDPOINT_REFERENCE_MISSING,
  PACS_AE_TITLE_REFERENCE_MISSING,
  PACS_TLS_CERTIFICATE_REFERENCE_MISSING,
  PACS_CALLBACK_CONFIGURATION_MISSING,
  PACS_MARKET_LEGAL_CONFIGURATION_MISSING,
  PACS_VIEWER_CONFIGURATION_MISSING,
  PACS_STORAGE_KMS_DEPENDENCY_GATED,
  PACS_MALWARE_SCAN_DEPENDENCY_GATED,
} from './production-pacs-requirements';

export type PacsValidationStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED_BUT_UNAVAILABLE'
  | 'VERIFIED_BUT_DISABLED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'EXTERNAL_GATED'
  | 'NOT_SELECTED'
  | 'DISABLED';

export type PacsActivationLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type PacsEnablementGuardCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export type PacsLegalGateItem = {
  id: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_VERIFICATION' | 'VERIFIED' | 'BLOCKED' | 'EXTERNAL_GATED';
  owner: string;
  evidence_required: string;
  blocker: string;
  next_action: string;
};

export type PacsCapabilityStatus = 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED' | 'NOT_SELECTED' | 'SANDBOX_ONLY';

export type ImagingStudyLifecycleMachine = {
  success_path: string[];
  exception_states: string[];
  notes: string[];
  terminal_overwrite_forbidden: true;
  idempotent_ingest: true;
  report_not_equal_diagnostic_viewer: true;
  sandbox_not_equal_production_transmission: true;
};

export type PacsWebhookSecurity = {
  status: 'NOT_APPLICABLE' | 'SANDBOX_ONLY' | 'EXTERNAL_GATED';
  unsigned_fail_closed: true;
  invalid_signature_rejected: true;
  duplicate_idempotent: true;
  secrets_logged: false;
  phi_logged: false;
  dicom_payload_logged: false;
};

export type PacsFirstOnboardingReport = {
  /** Production activation readiness sprint; foundation S80 on S70 rail. */
  sprint: 93;
  foundation_sprint: 80;
  provider: 'NOT_SELECTED' | string;
  environment: 'sandbox' | 'production';
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: boolean;
  validation_status: PacsValidationStatus;
  activation_lifecycle: PacsActivationLifecycle;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_AVAILABLE';
  production: 'EXTERNAL_GATED' | 'BLOCKED' | 'ENABLED';
  transmission: 'SANDBOX_ONLY' | 'NOT_VERIFIED' | 'EXTERNAL_GATED';
  viewer: 'EXTERNAL_GATED' | 'NOT_VERIFIED';
  dicom_metadata: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  study_lifecycle: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  radiologist_workflow: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  customer_report: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  report_lifecycle: ImagingStudyLifecycleMachine;
  study_state_machine: ImagingStudyLifecycleMachine;
  webhook_security: PacsWebhookSecurity;
  country_support: 'POLICY_DRIVEN' | 'EXTERNAL_GATED' | 'POLICY_REQUIRED';
  legal_clinical_gate: 'EXTERNAL_GATED';
  storage_requirement: 'EXTERNAL_GATED' | 'PRIVATE_STORAGE_EXTERNAL_GATED';
  object_storage: 'EXTERNAL_GATED' | 'PRIVATE_STORAGE_EXTERNAL_GATED';
  kms_encryption: 'EXTERNAL_GATED' | 'KMS_EXTERNAL_GATED';
  retention_policy: 'EXTERNAL_GATED';
  malware_scan: 'EXTERNAL_GATED' | 'MALWARE_SCAN_EXTERNAL_GATED';
  webhook: 'EXTERNAL_GATED' | 'SANDBOX_ONLY' | 'NOT_APPLICABLE';
  backup_recovery: 'EXTERNAL_GATED';
  capabilities: Record<string, PacsCapabilityStatus>;
  imaging_study_statuses_supported: string[];
  real_pacs_available: false | true;
  runtime_adapter: 'sandbox' | 'none';
  activation_stage: string;
  remaining_blocker: typeof NO_PRODUCTION_PACS_PROVIDER | string;
  remaining_blockers: string[];
  related_adapter_blocker: typeof NO_PRODUCTION_PACS_ADAPTER;
  s64_external_blocker: string | null;
  next_action: string;
  enablement_guard: {
    can_enable: false | true;
    checks: PacsEnablementGuardCheck[];
  };
  configuration_validation: ProductionPacsConfigurationValidation;
  force_launch_available: false;
  country_policy: {
    status: 'POLICY_DRIVEN';
    hardcoded_market: false;
    markets_supported_for_evaluation: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    note: string;
  };
  legal_gate_items: PacsLegalGateItem[];
  permission_model: {
    customer_own_reports_only: true;
    customer_cannot_mutate_report_state: true;
    radiologist_assigned_studies: true;
    imaging_operator_scoped: true;
    tenant_isolation: true;
    admin_activation_not_universal_image_access: true;
  };
  observability: {
    audit_events: true;
    correlation_id: true;
    no_phi_in_logs: true;
    no_dicom_payload_in_logs: true;
    not_selected_suppresses_false_outage: true;
  };
  outbox_idempotency: {
    study_ingest_keys: 'DETERMINISTIC';
    duplicate_ingest_prevented: true;
    duplicate_event_safe: true;
    fake_ack_cannot_mark_transmitted: true;
  };
  identifier_handling: {
    synthetic_uids_sandbox_only: true;
    study_series_sop_scoped: true;
    never_invent_production_uids: true;
  };
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  phi_printed: false;
  dicom_payload_printed: false;
  fake_provider_invented: false;
  fake_dicom_endpoint_invented: false;
  fake_production_viewer: false;
  message: string;
};

/** Sandbox / null adapters must never count as production PACS. */
export function isMockOrSandboxPacsProvider(code: string | null | undefined): boolean {
  if (!code) return true;
  const upper = code.trim().toUpperCase();
  return (
    upper === 'SANDBOX' ||
    upper === 'NULL' ||
    upper.startsWith('MOCK') ||
    upper.includes('SANDBOX')
  );
}

/** Deterministic validator — credentials alone never yield ENABLED. */
export function validatePacsConfiguration(input: {
  providerSelected: boolean;
  nonMockProductionAdapterRegistered: boolean;
  healthcareEnvironment: 'sandbox' | 'production';
  liveEnabled: boolean;
  humanApproved: boolean;
  credentialsPresent: boolean;
  endpointConfigured: boolean;
  aeTitlesConfigured: boolean;
  countrySupportConfigured: boolean;
  viewerConfigured: boolean;
  objectStorageProductionReady: boolean;
  kmsReady: boolean;
  legalClinicalConfigured: boolean;
}): PacsValidationStatus {
  if (!input.providerSelected) return 'NOT_SELECTED';
  if (!input.nonMockProductionAdapterRegistered) return 'NOT_CONFIGURED';
  const core =
    input.credentialsPresent &&
    input.endpointConfigured &&
    input.aeTitlesConfigured &&
    input.countrySupportConfigured &&
    input.legalClinicalConfigured &&
    input.objectStorageProductionReady &&
    input.kmsReady;
  if (!core) return 'NOT_CONFIGURED';
  if (!input.viewerConfigured || input.healthcareEnvironment !== 'production') {
    return 'CONFIGURED_BUT_UNAVAILABLE';
  }
  if (!input.humanApproved) return 'VERIFIED';
  if (!input.liveEnabled) return 'VERIFIED_BUT_DISABLED';
  return 'APPROVED';
}

export function evaluatePacsEnablementGuard(input: {
  nonMockProductionAdapterRegistered: boolean;
  healthcareEnvironment: 'sandbox' | 'production';
  liveEnabled: boolean;
  humanApproved: boolean;
  legalGateClear: boolean;
  objectStorageProductionReady: boolean;
  kmsReady: boolean;
  viewerProductionReady: boolean;
  emergencyDisabled: boolean;
  malwareScanReady?: boolean;
  countryPolicyConfigured?: boolean;
}): { can_enable: false | true; checks: PacsEnablementGuardCheck[] } {
  const checks: PacsEnablementGuardCheck[] = [
    {
      id: 'non_mock_adapter',
      ok: input.nonMockProductionAdapterRegistered,
      detail: input.nonMockProductionAdapterRegistered
        ? 'Non-mock production PACS adapter registered'
        : `Only SandboxPacsAdapter — ${NO_PRODUCTION_PACS_PROVIDER}`,
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
        : 'PROVIDER_APPROVED_PACS_DICOM missing',
    },
    {
      id: 'legal_clinical_gate',
      ok: input.legalGateClear,
      detail: input.legalGateClear
        ? 'Legal/clinical PACS prerequisites verified'
        : 'Legal/clinical PACS gate EXTERNAL_GATED',
    },
    {
      id: 'object_storage',
      ok: input.objectStorageProductionReady,
      detail: input.objectStorageProductionReady
        ? 'Production object storage ready'
        : 'PRIVATE_STORAGE_EXTERNAL_GATED (no local-disk production path)',
    },
    {
      id: 'kms_encryption',
      ok: input.kmsReady,
      detail: input.kmsReady ? 'KMS/encryption ready' : 'KMS_EXTERNAL_GATED',
    },
    {
      id: 'viewer_production',
      ok: input.viewerProductionReady,
      detail: input.viewerProductionReady
        ? 'Clinical DICOM viewer ready'
        : 'Clinical DICOM viewer EXTERNAL_GATED',
    },
    {
      id: 'malware_scan',
      ok: input.malwareScanReady !== false,
      detail:
        input.malwareScanReady === false
          ? 'MALWARE_SCAN_EXTERNAL_GATED'
          : 'Malware scan tracked; production scanner still EXTERNAL_GATED until adapter',
    },
    {
      id: 'country_policy',
      ok: input.countryPolicyConfigured !== false,
      detail:
        input.countryPolicyConfigured === false
          ? 'Imaging country policy POLICY_REQUIRED'
          : 'Imaging rules remain POLICY_DRIVEN / LEGAL_GATED per market',
    },
    {
      id: 'not_emergency_disabled',
      ok: !input.emergencyDisabled,
      detail: input.emergencyDisabled ? 'Emergency disable active' : 'No emergency disable',
    },
  ];
  return { can_enable: checks.every((c) => c.ok) ? true : false, checks };
}

export function buildImagingStudyLifecycleMachine(): ImagingStudyLifecycleMachine {
  return {
    success_path: [
      'SCHEDULED',
      'CHECKED_IN',
      'ACQUISITION_IN_PROGRESS',
      'ACQUIRED',
    ],
    exception_states: ['ACQUISITION_FAILED', 'CANCELLED'],
    notes: [
      'Reuse existing imaging study domain states — do not invent a second machine.',
      'Sandbox study/report ≠ production PACS or clinical DICOM viewer.',
      'IMAGING REPORT ≠ DIAGNOSTIC PACS VIEWER.',
      'Finalized reports must not be silently overwritten; publish is auditable.',
      'Ingest/report operations use deterministic idempotency keys.',
      'Fake PACS acknowledgement must never mark production transmission.',
    ],
    terminal_overwrite_forbidden: true,
    idempotent_ingest: true,
    report_not_equal_diagnostic_viewer: true,
    sandbox_not_equal_production_transmission: true,
  };
}

export function listPacsLegalClinicalGateItems(): PacsLegalGateItem[] {
  return [
    {
      id: 'provider_contract',
      status: 'EXTERNAL_GATED',
      owner: 'Legal / Imaging IT',
      evidence_required: 'Signed PACS/DICOM vendor contract + DPA',
      blocker: NO_PRODUCTION_PACS_PROVIDER,
      next_action: 'Procure market-authorized PACS vendor / connectivity',
    },
    {
      id: 'site_connectivity',
      status: 'EXTERNAL_GATED',
      owner: 'Imaging IT',
      evidence_required: 'AE titles, VPN/private network, modality routing',
      blocker: 'No production DICOM endpoint registered',
      next_action: 'Configure site connectivity after vendor selection',
    },
    {
      id: 'radiologist_credential',
      status: 'EXTERNAL_GATED',
      owner: 'Clinical ops',
      evidence_required: 'Radiologist credential / privilege verification',
      blocker: 'Live credential registry EXTERNAL_GATED',
      next_action: 'Wire verification before live interpretation claims',
    },
    {
      id: 'viewer_authorization',
      status: 'EXTERNAL_GATED',
      owner: 'Clinical / Security',
      evidence_required: 'Short-lived viewer session + PHI access audit',
      blocker: 'Clinical viewer EXTERNAL_GATED',
      next_action: 'Enable viewer only after PACS + auth gates clear',
    },
    {
      id: 'object_storage_kms',
      status: 'EXTERNAL_GATED',
      owner: 'Platform / Security',
      evidence_required: 'Private bucket + encryption/KMS + signed access',
      blocker: 'PRIVATE_STORAGE_EXTERNAL_GATED / KMS_EXTERNAL_GATED',
      next_action: 'Do not use local disk for production DICOM objects',
    },
    {
      id: 'retention_deletion',
      status: 'EXTERNAL_GATED',
      owner: 'Legal / Privacy',
      evidence_required: 'Retention and deletion policy per market',
      blocker: 'Retention policy not production-attested',
      next_action: 'Complete retention/deletion review before enablement',
    },
    {
      id: 'country_imaging_rules',
      status: 'EXTERNAL_GATED',
      owner: 'Legal',
      evidence_required: 'Per-country imaging/PACS legality memo (policy-driven)',
      blocker: 'Market imaging rules not certified in-product',
      next_action: 'Complete legal review per launch country',
    },
    {
      id: 'malware_scan',
      status: 'EXTERNAL_GATED',
      owner: 'Security',
      evidence_required: 'Malware/file scanning for ingested objects',
      blocker: 'MALWARE_SCAN_EXTERNAL_GATED',
      next_action: 'Register scanner before live object ingestion',
    },
  ];
}

/** Authoritative PACS onboarding snapshot — SandboxPacsAdapter only. */
export function evaluatePacsFirstOnboarding(): PacsFirstOnboardingReport {
  const env = readHealthcareEnvironment();
  const live = isLiveHealthcareEnabled();
  const activation = evaluateProviderActivation(getProviderActivationContract('PACS_DICOM'));
  const humanApproved =
    process.env['PROVIDER_APPROVED_PACS_DICOM']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_APPROVED_PACS']?.trim().toLowerCase() === 'true';
  const emergency =
    process.env['PROVIDER_EMERGENCY_DISABLE_ALL']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_PACS_DICOM']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_PACS']?.trim().toLowerCase() === 'true';

  void isMockOrSandboxPacsProvider('sandbox');

  const real = false;
  const guard = evaluatePacsEnablementGuard({
    nonMockProductionAdapterRegistered: real,
    healthcareEnvironment: env,
    liveEnabled: live,
    humanApproved,
    legalGateClear: false,
    objectStorageProductionReady: false,
    kmsReady: false,
    viewerProductionReady: false,
    emergencyDisabled: emergency,
    malwareScanReady: false,
  });

  const validation_status = validatePacsConfiguration({
    providerSelected: false,
    nonMockProductionAdapterRegistered: real,
    healthcareEnvironment: env,
    liveEnabled: live,
    humanApproved,
    credentialsPresent: false,
    endpointConfigured: false,
    aeTitlesConfigured: false,
    countrySupportConfigured: false,
    viewerConfigured: false,
    objectStorageProductionReady: false,
    kmsReady: false,
    legalClinicalConfigured: false,
  });

  const configuration_validation = validateProductionPacsConfiguration({
    providerSelected: real,
    providerName: 'NOT_SELECTED',
    nonMockAdapterRegistered: real,
  });

  const remaining_blockers = [
    NO_PRODUCTION_PACS_PROVIDER,
    NO_PRODUCTION_PACS_ADAPTER,
    ...configuration_validation.blockers,
  ];

  const studyMachine = buildImagingStudyLifecycleMachine();

  return {
    sprint: 93,
    foundation_sprint: 80,
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
    viewer: 'EXTERNAL_GATED',
    dicom_metadata: 'SANDBOX_VERIFIED',
    study_lifecycle: 'SANDBOX_VERIFIED',
    radiologist_workflow: 'SANDBOX_VERIFIED',
    customer_report: 'SANDBOX_VERIFIED',
    report_lifecycle: studyMachine,
    study_state_machine: studyMachine,
    webhook_security: {
      status: 'EXTERNAL_GATED',
      unsigned_fail_closed: true,
      invalid_signature_rejected: true,
      duplicate_idempotent: true,
      secrets_logged: false,
      phi_logged: false,
      dicom_payload_logged: false,
    },
    country_support: 'POLICY_DRIVEN',
    legal_clinical_gate: 'EXTERNAL_GATED',
    storage_requirement: 'PRIVATE_STORAGE_EXTERNAL_GATED',
    object_storage: 'PRIVATE_STORAGE_EXTERNAL_GATED',
    kms_encryption: 'KMS_EXTERNAL_GATED',
    retention_policy: 'EXTERNAL_GATED',
    malware_scan: 'MALWARE_SCAN_EXTERNAL_GATED',
    webhook: 'EXTERNAL_GATED',
    backup_recovery: 'EXTERNAL_GATED',
    capabilities: {
      dicom_study_ingestion: 'SANDBOX_ONLY',
      modality_study_identifiers: 'SANDBOX_VERIFIED',
      accession_study_linkage: 'SANDBOX_VERIFIED',
      patient_order_linkage: 'SANDBOX_VERIFIED',
      secure_study_retrieval: 'EXTERNAL_GATED',
      radiologist_authorization: 'SANDBOX_VERIFIED',
      viewer_launch_session: 'EXTERNAL_GATED',
      report_linkage: 'SANDBOX_VERIFIED',
      audit_trail: 'SANDBOX_VERIFIED',
      failure_retry: 'SANDBOX_VERIFIED',
      idempotency: 'SANDBOX_VERIFIED',
      tenant_org_isolation: 'SANDBOX_VERIFIED',
      phi_access_control: 'SANDBOX_VERIFIED',
      production_storage: 'EXTERNAL_GATED',
      retention_deletion: 'EXTERNAL_GATED',
      country_legal_gate: 'EXTERNAL_GATED',
      emergency_disable: 'SANDBOX_VERIFIED',
    },
    imaging_study_statuses_supported: [
      'SCHEDULED',
      'CHECKED_IN',
      'ACQUISITION_IN_PROGRESS',
      'ACQUIRED',
      'ACQUISITION_FAILED',
      'CANCELLED',
    ],
    real_pacs_available: real,
    runtime_adapter: 'sandbox',
    activation_stage: activation.stage,
    remaining_blocker: NO_PRODUCTION_PACS_PROVIDER,
    remaining_blockers,
    related_adapter_blocker: NO_PRODUCTION_PACS_ADAPTER,
    s64_external_blocker: activation.external_blocker,
    next_action:
      'Supply PACS contract + AE titles/endpoint vault refs + production PacsAdapter + private storage/KMS + malware scanner + clinical viewer; set PROVIDER_APPROVED_PACS_DICOM; then HEALTHCARE_LIVE_ENABLED after guard. SandboxPacsAdapter is not production PACS.',
    enablement_guard: guard,
    configuration_validation,
    force_launch_available: false,
    country_policy: {
      status: 'POLICY_DRIVEN',
      hardcoded_market: false,
      markets_supported_for_evaluation: ['GLOBAL', 'IN', 'AE', 'US'],
      note: 'Imaging/PACS legality remain policy packs — do not invent legal rules.',
    },
    legal_gate_items: listPacsLegalClinicalGateItems(),
    permission_model: {
      customer_own_reports_only: true,
      customer_cannot_mutate_report_state: true,
      radiologist_assigned_studies: true,
      imaging_operator_scoped: true,
      tenant_isolation: true,
      admin_activation_not_universal_image_access: true,
    },
    observability: {
      audit_events: true,
      correlation_id: true,
      no_phi_in_logs: true,
      no_dicom_payload_in_logs: true,
      not_selected_suppresses_false_outage: true,
    },
    outbox_idempotency: {
      study_ingest_keys: 'DETERMINISTIC',
      duplicate_ingest_prevented: true,
      duplicate_event_safe: true,
      fake_ack_cannot_mark_transmitted: true,
    },
    identifier_handling: {
      synthetic_uids_sandbox_only: true,
      study_series_sop_scoped: true,
      never_invent_production_uids: true,
    },
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    phi_printed: false,
    dicom_payload_printed: false,
    fake_provider_invented: false,
    fake_dicom_endpoint_invented: false,
    fake_production_viewer: false,
    message:
      'No production PACS/DICOM provider selected (NO_PRODUCTION_PACS_PROVIDER). Sandbox imaging study + radiologist report workflow remains available. Clinical DICOM viewer EXTERNAL_GATED. Production PACS EXTERNAL_GATED.',
  };
}

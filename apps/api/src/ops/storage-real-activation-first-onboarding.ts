/**
 * Sprint 107 — Real production private storage + KMS + malware scanning activation readiness.
 * Composes S73/S82/S95. Never invents cloud buckets, KMS keys, malware engines, or credentials.
 * Never claims production activation. Local disk is never a production fallback.
 */
import {
  NO_PRODUCTION_PRIVATE_STORAGE,
  NO_PRODUCTION_KMS,
  NO_PRODUCTION_MALWARE_SCANNER,
  evaluateProductionStorageFirstOnboarding,
  type StorageActivationLifecycle,
} from './production-storage-first-onboarding';
import {
  STORAGE_PROVIDER_NOT_SELECTED,
  STORAGE_CREDENTIAL_REFERENCE_MISSING,
  STORAGE_BUCKET_REFERENCE_MISSING,
  STORAGE_REGION_REFERENCE_MISSING,
  KMS_PROVIDER_NOT_SELECTED,
  KMS_KEY_REFERENCE_MISSING,
  KMS_SECRET_MANAGER_REFERENCE_MISSING,
  MALWARE_PROVIDER_NOT_SELECTED,
  MALWARE_ENDPOINT_REFERENCE_MISSING,
  MALWARE_CREDENTIAL_REFERENCE_MISSING,
  STORAGE_RETENTION_POLICY_CONFIGURATION_REQUIRED,
  STORAGE_BACKUP_DEPENDENCY_GATED,
  validateProductionStorageConfiguration,
} from './production-storage-requirements';
import { evaluateProductionStorageAvailable } from './production-storage-gate';
import { evaluateProductionFoundationFirstOnboarding } from './production-foundation-first-onboarding';
import { evaluateProductionLaunchControl } from './production-launch-control';

/** Canonical umbrella (S73/S95). Sprint 107 report alias for object-storage wording. */
export const NO_PRODUCTION_OBJECT_STORAGE_PROVIDER = NO_PRODUCTION_PRIVATE_STORAGE;

/** Production private-access proof not attested (sandbox opaque tickets ≠ production ACL). */
export const STORAGE_PRIVATE_ACCESS_NOT_VERIFIED = 'STORAGE_PRIVATE_ACCESS_NOT_VERIFIED';

/** Endpoint/region/bucket wiring incomplete — complements STORAGE_BUCKET/REGION refs. */
export const STORAGE_ENDPOINT_REFERENCE_MISSING = 'STORAGE_ENDPOINT_REFERENCE_MISSING';

/** Observability/audit dependency for production storage triad. */
export const MONITORING_DEPENDENCY_GATED = 'MONITORING_DEPENDENCY_GATED';

/** Alias wording for malware config (umbrella remains NO_PRODUCTION_MALWARE_SCANNER). */
export const MALWARE_SCANNER_CONFIGURATION_MISSING = 'MALWARE_SCANNER_CONFIGURATION_MISSING';

export {
  NO_PRODUCTION_PRIVATE_STORAGE,
  NO_PRODUCTION_KMS,
  NO_PRODUCTION_MALWARE_SCANNER,
  STORAGE_PROVIDER_NOT_SELECTED,
  STORAGE_CREDENTIAL_REFERENCE_MISSING,
  STORAGE_BUCKET_REFERENCE_MISSING,
  STORAGE_REGION_REFERENCE_MISSING,
  KMS_PROVIDER_NOT_SELECTED,
  KMS_KEY_REFERENCE_MISSING,
  KMS_SECRET_MANAGER_REFERENCE_MISSING,
  MALWARE_PROVIDER_NOT_SELECTED,
  MALWARE_ENDPOINT_REFERENCE_MISSING,
  MALWARE_CREDENTIAL_REFERENCE_MISSING,
  STORAGE_RETENTION_POLICY_CONFIGURATION_REQUIRED,
  STORAGE_BACKUP_DEPENDENCY_GATED,
};

export type RealStorageLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURATION_REQUIRED'
  | 'CREDENTIALS_REQUIRED'
  | 'VERIFICATION_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'READY_FOR_ACTIVATION'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type RealStorageMarketStatus = {
  market: 'GLOBAL' | 'IN' | 'AE' | 'US';
  lifecycle: RealStorageLifecycle;
  sandbox: 'SANDBOX_VERIFIED';
  production: 'PRODUCTION_EXTERNAL_GATED' | 'ENABLED';
  blocker: string;
  retention: 'RETENTION_POLICY_REQUIRED' | 'POLICY_DRIVEN';
};

export type RealStorageChecklistItem = {
  id: string;
  label: string;
  mandatory: boolean;
  status: 'MISSING' | 'PRESENT' | 'PENDING' | 'N/A';
};

export type RealStorageRailStatus = {
  rail: 'OBJECT_STORAGE' | 'KMS' | 'MALWARE_SCANNER';
  provider: 'NOT_SELECTED';
  real_provider_selected: false;
  production_enabled: false;
  lifecycle: RealStorageLifecycle;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_ONLY';
  production: 'EXTERNAL_GATED';
  blocker: string;
};

function mapLifecycle(s95: StorageActivationLifecycle): RealStorageLifecycle {
  if (s95 === 'ENABLED') return 'ENABLED';
  if (s95 === 'DISABLED') return 'DISABLED';
  if (s95 === 'NOT_SELECTED') return 'NOT_SELECTED';
  if (s95 === 'APPROVED') return 'APPROVAL_REQUIRED';
  if (s95 === 'VERIFIED') return 'VERIFICATION_REQUIRED';
  if (s95 === 'CONFIGURED') return 'CONFIGURATION_REQUIRED';
  return 'EXTERNAL_GATED';
}

export function buildRealStorageActivationChecklist(): RealStorageChecklistItem[] {
  const v = validateProductionStorageConfiguration();
  return [
    {
      id: 'storage_provider_selected',
      label: 'Real object storage provider selected?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'storage_credentials',
      label: 'Storage credentials via approved secret manager?',
      mandatory: true,
      status: v.credential_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'storage_endpoint',
      label: 'Endpoint / region configured?',
      mandatory: true,
      status: v.region_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'bucket_container',
      label: 'Private bucket/container configured?',
      mandatory: true,
      status: v.bucket_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'private_access_verified',
      label: 'Private access verified (no anonymous/public)?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'encryption_configured',
      label: 'Server-side encryption configured?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'kms_provider',
      label: 'KMS provider selected?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'kms_key_reference',
      label: 'KMS key reference/alias configured?',
      mandatory: true,
      status: v.kms_key_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'malware_scanner',
      label: 'Malware scanner configured?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'malware_webhook',
      label: 'Scanner webhook/callback configured (if applicable)?',
      mandatory: true,
      status: v.malware_endpoint_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'retention',
      label: 'Retention / lifecycle configuration?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'backup_dependency',
      label: 'Backup/recovery dependency configured?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'monitoring',
      label: 'Monitoring / audit configured?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'security_verification',
      label: 'Security verification complete?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'approval',
      label: 'Human approval complete?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'sandbox_local_store',
      label: 'Sandbox LocalPrivateObjectStore verified?',
      mandatory: true,
      status: 'PRESENT',
    },
    {
      id: 'production_activation',
      label: 'Production triad enabled?',
      mandatory: true,
      status: 'MISSING',
    },
  ];
}

export function buildRealStorageMarketStatuses(): RealStorageMarketStatus[] {
  return (['GLOBAL', 'IN', 'AE', 'US'] as const).map((market) => ({
    market,
    lifecycle: 'NOT_SELECTED' as const,
    sandbox: 'SANDBOX_VERIFIED' as const,
    production: 'PRODUCTION_EXTERNAL_GATED' as const,
    blocker: NO_PRODUCTION_PRIVATE_STORAGE,
    retention: 'RETENTION_POLICY_REQUIRED' as const,
  }));
}

export function buildRealStorageRailStatuses(): RealStorageRailStatus[] {
  return [
    {
      rail: 'OBJECT_STORAGE',
      provider: 'NOT_SELECTED',
      real_provider_selected: false,
      production_enabled: false,
      lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_VERIFIED',
      production: 'EXTERNAL_GATED',
      blocker: NO_PRODUCTION_PRIVATE_STORAGE,
    },
    {
      rail: 'KMS',
      provider: 'NOT_SELECTED',
      real_provider_selected: false,
      production_enabled: false,
      lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_ONLY',
      production: 'EXTERNAL_GATED',
      blocker: NO_PRODUCTION_KMS,
    },
    {
      rail: 'MALWARE_SCANNER',
      provider: 'NOT_SELECTED',
      real_provider_selected: false,
      production_enabled: false,
      lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_ONLY',
      production: 'EXTERNAL_GATED',
      blocker: NO_PRODUCTION_MALWARE_SCANNER,
    },
  ];
}

export type RealStorageFirstOnboardingReport = {
  sprint: 107;
  foundation_sprints: string;
  activation_lifecycle: RealStorageLifecycle;
  environment: 'sandbox' | 'production';
  real_object_storage_provider_selected: false;
  production_object_storage_enabled: false;
  real_kms_provider_selected: false;
  production_kms_enabled: false;
  real_malware_scanner_selected: false;
  production_malware_scanning_enabled: false;
  private_storage_verified: 'SANDBOX_ONLY';
  production_local_disk_fallback_possible: false;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: false;
  ready_for_activation: false;
  sandbox: 'SANDBOX_VERIFIED';
  production: 'EXTERNAL_GATED';
  rails: RealStorageRailStatus[];
  checklist: RealStorageChecklistItem[];
  markets: RealStorageMarketStatus[];
  malware_lifecycle: {
    success_path: string[];
    exception_states: string[];
    unscanned_not_available: true;
    infected_blocked: true;
    scanner_failure_not_clean: true;
    sandbox_scanner: 'SANDBOX_ONLY';
    production_scanner: 'EXTERNAL_GATED';
  };
  security_controls: {
    no_anonymous_private_access: true;
    no_predictable_public_urls: true;
    tenant_isolation: true;
    never_fallback_to_local_disk: true;
    kms_unavailable_fail_closed: true;
    storage_unavailable_fail_closed: true;
    secrets_never_displayed: true;
  };
  healthcare_kyc_document_safety: {
    kyc_documents: 'SANDBOX_PRIVATE';
    pharmacy_vendor: 'SANDBOX_PRIVATE';
    doctor_credentials: 'SANDBOX_PRIVATE';
    lab_reports: 'SANDBOX_PRIVATE';
    imaging_reports: 'SANDBOX_PRIVATE';
    prescriptions: 'SANDBOX_PRIVATE';
    production_malware_before_availability: 'EXTERNAL_GATED';
  };
  configuration_readiness: ReturnType<
    typeof validateProductionStorageConfiguration
  >['configuration_readiness'];
  storage_gate: ReturnType<typeof evaluateProductionStorageAvailable>;
  remaining_blocker: typeof NO_PRODUCTION_PRIVATE_STORAGE;
  remaining_blockers: string[];
  next_action: string;
  force_launch_available: false;
  force_deploy_available: false;
  can_production_launch: 'NO';
  launch_control_overall: string;
  control_plane: 'S100_REUSED';
  foundation_plane: 'S101_REUSED';
  s95_plane: 'COMPOSED';
  runtime_adapters: {
    object_storage: 'local_private_object_store';
    kms: 'env_refs_only';
    malware_scanner: 'deterministic_sandbox';
  };
  evaluated_at: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  kms_material_printed: false;
  signed_urls_printed: false;
  document_contents_printed: false;
  fake_storage_provider_invented: false;
  fake_kms_key_invented: false;
  fake_malware_scanner_invented: false;
  message: string;
};

export function evaluateRealStorageFirstOnboarding(
  input?: { correlation_id?: string },
): RealStorageFirstOnboardingReport {
  const s95 = evaluateProductionStorageFirstOnboarding();
  const foundation = evaluateProductionFoundationFirstOnboarding();
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id: input?.correlation_id,
  });
  const checklist = buildRealStorageActivationChecklist();
  const markets = buildRealStorageMarketStatuses();
  const rails = buildRealStorageRailStatuses();
  const config = validateProductionStorageConfiguration();
  const storage_gate = evaluateProductionStorageAvailable();

  const remaining_blockers = [
    NO_PRODUCTION_PRIVATE_STORAGE,
    NO_PRODUCTION_OBJECT_STORAGE_PROVIDER,
    NO_PRODUCTION_KMS,
    NO_PRODUCTION_MALWARE_SCANNER,
    STORAGE_PROVIDER_NOT_SELECTED,
    STORAGE_CREDENTIAL_REFERENCE_MISSING,
    STORAGE_ENDPOINT_REFERENCE_MISSING,
    STORAGE_BUCKET_REFERENCE_MISSING,
    STORAGE_REGION_REFERENCE_MISSING,
    STORAGE_PRIVATE_ACCESS_NOT_VERIFIED,
    KMS_PROVIDER_NOT_SELECTED,
    KMS_KEY_REFERENCE_MISSING,
    KMS_SECRET_MANAGER_REFERENCE_MISSING,
    MALWARE_PROVIDER_NOT_SELECTED,
    MALWARE_SCANNER_CONFIGURATION_MISSING,
    MALWARE_ENDPOINT_REFERENCE_MISSING,
    MALWARE_CREDENTIAL_REFERENCE_MISSING,
    STORAGE_RETENTION_POLICY_CONFIGURATION_REQUIRED,
    STORAGE_BACKUP_DEPENDENCY_GATED,
    MONITORING_DEPENDENCY_GATED,
    'LOCAL_DISK_STORAGE_PRODUCTION_FORBIDDEN',
    ...foundation.remaining_blockers.filter((b) =>
      [
        'NO_PRODUCTION_ENVIRONMENT',
        'NO_PRODUCTION_SECRETS_MANAGER',
        'NO_PRODUCTION_DATABASE',
        'NO_PRODUCTION_DEPLOYMENT_TARGET',
      ].includes(b),
    ),
    ...s95.remaining_blockers.slice(0, 6),
  ];

  return {
    sprint: 107,
    foundation_sprints: '73,82,87,95,98,100,101,106',
    activation_lifecycle: mapLifecycle(s95.activation_lifecycle),
    environment: s95.environment,
    real_object_storage_provider_selected: false,
    production_object_storage_enabled: false,
    real_kms_provider_selected: false,
    production_kms_enabled: false,
    real_malware_scanner_selected: false,
    production_malware_scanning_enabled: false,
    private_storage_verified: 'SANDBOX_ONLY',
    production_local_disk_fallback_possible: false,
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    ready_for_activation: false,
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    rails,
    checklist,
    markets,
    malware_lifecycle: {
      success_path: ['UPLOAD', 'QUARANTINED', 'SCANNING', 'CLEAN', 'AVAILABLE'],
      exception_states: ['REJECTED', 'INFECTED', 'SCAN_FAILED'],
      unscanned_not_available: true,
      infected_blocked: true,
      scanner_failure_not_clean: true,
      sandbox_scanner: 'SANDBOX_ONLY',
      production_scanner: 'EXTERNAL_GATED',
    },
    security_controls: {
      no_anonymous_private_access: true,
      no_predictable_public_urls: true,
      tenant_isolation: true,
      never_fallback_to_local_disk: true,
      kms_unavailable_fail_closed: true,
      storage_unavailable_fail_closed: true,
      secrets_never_displayed: true,
    },
    healthcare_kyc_document_safety: {
      kyc_documents: 'SANDBOX_PRIVATE',
      pharmacy_vendor: 'SANDBOX_PRIVATE',
      doctor_credentials: 'SANDBOX_PRIVATE',
      lab_reports: 'SANDBOX_PRIVATE',
      imaging_reports: 'SANDBOX_PRIVATE',
      prescriptions: 'SANDBOX_PRIVATE',
      production_malware_before_availability: 'EXTERNAL_GATED',
    },
    configuration_readiness: config.configuration_readiness,
    storage_gate,
    remaining_blocker: NO_PRODUCTION_PRIVATE_STORAGE,
    remaining_blockers: [...new Set(remaining_blockers)],
    next_action:
      'Select real private object storage + KMS + malware scanner, vault credential/endpoint/bucket/key refs via S101, attest private ACL + encryption + retention + backup, prove no local-disk fallback, then human approval. Do not invent cloud resources or claim production from sandbox LocalPrivateObjectStore.',
    force_launch_available: false,
    force_deploy_available: false,
    can_production_launch: 'NO',
    launch_control_overall: launch.overall_status,
    control_plane: 'S100_REUSED',
    foundation_plane: 'S101_REUSED',
    s95_plane: 'COMPOSED',
    runtime_adapters: {
      object_storage: 'local_private_object_store',
      kms: 'env_refs_only',
      malware_scanner: 'deterministic_sandbox',
    },
    evaluated_at: new Date().toISOString(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    kms_material_printed: false,
    signed_urls_printed: false,
    document_contents_printed: false,
    fake_storage_provider_invented: false,
    fake_kms_key_invented: false,
    fake_malware_scanner_invented: false,
    message:
      'Sprint 107 real storage/KMS/malware readiness: all providers NOT_SELECTED / EXTERNAL_GATED. Sandbox LocalPrivateObjectStore + DeterministicSandboxMalwareScanner remain SANDBOX_ONLY. PRIVATE STORAGE VERIFIED = SANDBOX_ONLY. PRODUCTION LOCAL-DISK FALLBACK = NO. PRODUCTION STORAGE/KMS/MALWARE ENABLED = NO. CAN_PRODUCTION_LAUNCH = NO.',
  };
}

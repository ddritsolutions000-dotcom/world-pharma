/**
 * Sprint 73 foundation + Sprint 82 readiness + Sprint 95 production private storage /
 * KMS / malware scanning activation readiness.
 * Never invent cloud buckets, KMS keys, malware engines, or live credentials.
 * Never print secrets / signed tickets / raw document contents / PHI / KMS material.
 *
 * Local/sandbox PrivateObjectStore ≠ production private storage.
 * DeterministicSandboxMalwareScanner ≠ production AV.
 * Application env secrets ≠ production KMS.
 * UNSCANNED ≠ TRUSTED.
 * DATABASE BACKUP ≠ OBJECT STORAGE BACKUP.
 */
import {
  isLiveFileScanningEnabled,
  isLiveObjectStorageEnabled,
  isLocalDiskStorageBackend,
  isMockScannerProvider,
  readFileScanningEnvironment,
  readInfrastructureEnvironment,
  readObjectStorageEnvironment,
} from './infra-environment';
import { evaluateProductionFileScanningAvailable } from './production-file-scanning-gate';
import { evaluateProductionStorageAvailable } from './production-storage-gate';
import { evaluateProviderActivation } from './provider-activation';
import { getProviderActivationContract } from './provider-activation-contracts';
import {
  validateProductionStorageConfiguration,
  type ProductionStorageConfigurationValidation,
} from './production-storage-requirements';

/** Canonical production blockers (unchanged codes from S73). Never remove. */
export const NO_PRODUCTION_PRIVATE_STORAGE = 'NO_PRODUCTION_PRIVATE_STORAGE';
export const NO_PRODUCTION_KMS = 'NO_PRODUCTION_KMS';
export const NO_PRODUCTION_MALWARE_SCANNER = 'NO_PRODUCTION_MALWARE_SCANNER';

export {
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
} from './production-storage-requirements';

export type StorageActivationLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type StorageValidationStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED_BUT_UNAVAILABLE'
  | 'VERIFIED_BUT_DISABLED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'EXTERNAL_GATED'
  | 'NOT_SELECTED'
  | 'DISABLED';

export type StorageEnablementGuardCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export type StorageLegalGateItem = {
  id: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_VERIFICATION' | 'VERIFIED' | 'BLOCKED' | 'EXTERNAL_GATED';
  owner: string;
  evidence_required: string;
  blocker: string;
  next_action: string;
};

export type StorageCapabilityStatus =
  | 'SANDBOX_VERIFIED'
  | 'EXTERNAL_GATED'
  | 'NOT_SELECTED'
  | 'SANDBOX_ONLY'
  | 'POLICY_DRIVEN'
  | 'POLICY_REQUIRED'
  | 'LEGAL_REVIEW_REQUIRED'
  | 'RETENTION_POLICY_REQUIRED'
  | 'LEGAL_GATED';

export type MalwareScanLifecycleMachine = {
  success_path: string[];
  exception_states: string[];
  notes: string[];
  never_trust_unscanned: true;
  terminal_overwrite_forbidden: true;
  idempotent_scan_events: true;
  scanner_failure_not_clean: true;
  unscanned_not_available: true;
};

export type StorageRailSnapshot = {
  provider: 'NOT_SELECTED' | string;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: boolean;
  validation_status: StorageValidationStatus;
  activation_lifecycle?: StorageActivationLifecycle;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_ONLY' | 'SANDBOX_AVAILABLE';
  production: 'EXTERNAL_GATED' | 'BLOCKED' | 'ENABLED';
  remaining_blocker: string;
  remaining_blockers?: string[];
  s64_external_blocker: string | null;
  activation_stage: string;
};

export type ProductionStorageFirstOnboardingReport = {
  /** Production activation readiness sprint; foundation S82 on S73 rail. */
  sprint: 95;
  foundation_sprint: 82;
  environment: 'sandbox' | 'production';
  activation_lifecycle: StorageActivationLifecycle;
  object_storage: StorageRailSnapshot & {
    private_access: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
    signed_url_access: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
    never_fallback_to_local_disk: true;
  };
  kms: StorageRailSnapshot & {
    encryption_at_rest: 'EXTERNAL_GATED' | 'SANDBOX_ONLY';
    key_rotation: 'EXTERNAL_GATED';
    application_encryption_alone_insufficient: true;
  };
  malware_scanning: StorageRailSnapshot & {
    scan_lifecycle: 'SANDBOX_ONLY' | 'EXTERNAL_GATED';
    never_trust_unscanned: true;
    statuses_supported: string[];
  };
  malware_scan_state_machine: MalwareScanLifecycleMachine;
  private_access: 'SANDBOX_VERIFIED';
  signed_url_model: 'OPAQUE_TICKET_SHORT_LIVED_SANDBOX_VERIFIED';
  retention: 'RETENTION_POLICY_REQUIRED' | 'EXTERNAL_GATED';
  backup_pitr_dependency: 'EXTERNAL_GATED';
  data_residency: 'POLICY_DRIVEN' | 'LEGAL_REVIEW_REQUIRED';
  audit_logging: 'SANDBOX_VERIFIED';
  legal_privacy_gate: 'EXTERNAL_GATED';
  phi_clinical_separation: 'SANDBOX_VERIFIED';
  data_classification: string[];
  scan_lifecycle_stages: string[];
  capabilities: Record<string, StorageCapabilityStatus>;
  real_object_storage_available: false | true;
  real_kms_available: false | true;
  real_malware_scanner_available: false | true;
  runtime_adapters: {
    object_storage: 'local_private_object_store' | 'none';
    malware_scanner: 'deterministic_sandbox' | 'noop' | 'none';
    kms: 'env_refs_only' | 'none';
  };
  remaining_blocker: typeof NO_PRODUCTION_PRIVATE_STORAGE | string;
  remaining_blockers: string[];
  next_action: string;
  enablement_guard: {
    can_enable: false | true;
    checks: StorageEnablementGuardCheck[];
  };
  configuration_validation: ProductionStorageConfigurationValidation;
  force_launch_available: false;
  country_policy: {
    status: 'POLICY_DRIVEN';
    hardcoded_market: false;
    markets_supported_for_evaluation: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    note: string;
  };
  legal_gate_items: StorageLegalGateItem[];
  permission_model: {
    tenant_isolation: true;
    cross_partner_document_isolation: true;
    no_anonymous_private_access: true;
    admin_activation_not_universal_document_access: true;
    retired_objects_not_retrievable: true;
    expired_ticket_rejected: true;
  };
  observability: {
    audit_events: true;
    correlation_id: true;
    no_secrets_or_tickets_in_logs: true;
    no_phi_document_dumps: true;
    not_selected_suppresses_false_outage: true;
  };
  failure_modes: {
    scanner_unavailable_not_clean: true;
    scanner_timeout_not_clean: true;
    rejected_not_available: true;
    duplicate_scan_idempotent: true;
  };
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  signed_urls_printed: false;
  kms_material_printed: false;
  document_contents_printed: false;
  phi_printed: false;
  fake_storage_provider_invented: false;
  fake_kms_key_invented: false;
  fake_malware_scanner_invented: false;
  message: string;
};

export function isLiveKmsEnabled(): boolean {
  return process.env['KMS_LIVE_ENABLED']?.trim().toLowerCase() === 'true';
}

export function isMockOrLocalStorageBackend(code: string | null | undefined): boolean {
  if (!code) return true;
  return (
    isLocalDiskStorageBackend(code) ||
    code.trim().toUpperCase() === 'LOCAL' ||
    code.trim().toUpperCase().includes('SANDBOX')
  );
}

export function isMockOrSandboxKmsProvider(code: string | null | undefined): boolean {
  if (!code) return true;
  const upper = code.trim().toUpperCase();
  return (
    upper === 'ENV' ||
    upper === 'LOCAL' ||
    upper === 'SANDBOX' ||
    upper === 'NULL' ||
    upper.startsWith('MOCK') ||
    upper.includes('SANDBOX')
  );
}

/** Deterministic validator — bucket refs alone never yield ENABLED. */
export function validateObjectStorageConfiguration(input: {
  providerSelected: boolean;
  nonLocalProductionAdapterRegistered: boolean;
  storageEnvironment: 'sandbox' | 'production';
  storageLiveEnabled: boolean;
  humanApproved: boolean;
  bucketRefPresent: boolean;
  secretRefPresent: boolean;
  privateAclConfigured: boolean;
  encryptionConfigured: boolean;
  legalPrivacyConfigured: boolean;
}): StorageValidationStatus {
  if (!input.providerSelected) return 'NOT_SELECTED';
  if (!input.nonLocalProductionAdapterRegistered) return 'NOT_CONFIGURED';
  const core =
    input.bucketRefPresent &&
    input.secretRefPresent &&
    input.privateAclConfigured &&
    input.encryptionConfigured &&
    input.legalPrivacyConfigured;
  if (!core) return 'NOT_CONFIGURED';
  if (input.storageEnvironment !== 'production') return 'CONFIGURED_BUT_UNAVAILABLE';
  if (!input.humanApproved) return 'VERIFIED';
  if (!input.storageLiveEnabled) return 'VERIFIED_BUT_DISABLED';
  return 'APPROVED';
}

export function validateKmsConfiguration(input: {
  providerSelected: boolean;
  nonMockProductionKmsRegistered: boolean;
  infrastructureEnvironment: 'sandbox' | 'production';
  kmsLiveEnabled: boolean;
  humanApproved: boolean;
  keyRefPresent: boolean;
  secretManagerRefPresent: boolean;
  rotationConfigured: boolean;
  legalPrivacyConfigured: boolean;
}): StorageValidationStatus {
  if (!input.providerSelected) return 'NOT_SELECTED';
  if (!input.nonMockProductionKmsRegistered) return 'NOT_CONFIGURED';
  const core =
    input.keyRefPresent &&
    input.secretManagerRefPresent &&
    input.rotationConfigured &&
    input.legalPrivacyConfigured;
  if (!core) return 'NOT_CONFIGURED';
  if (input.infrastructureEnvironment !== 'production') return 'CONFIGURED_BUT_UNAVAILABLE';
  if (!input.humanApproved) return 'VERIFIED';
  if (!input.kmsLiveEnabled) return 'VERIFIED_BUT_DISABLED';
  return 'APPROVED';
}

export function validateMalwareScannerConfiguration(input: {
  providerSelected: boolean;
  nonMockProductionScannerRegistered: boolean;
  scanningEnvironment: 'sandbox' | 'production';
  scanningLiveEnabled: boolean;
  humanApproved: boolean;
  endpointRefPresent: boolean;
  quarantineConfigured: boolean;
  legalPrivacyConfigured: boolean;
}): StorageValidationStatus {
  if (!input.providerSelected) return 'NOT_SELECTED';
  if (!input.nonMockProductionScannerRegistered) return 'NOT_CONFIGURED';
  const core =
    input.endpointRefPresent && input.quarantineConfigured && input.legalPrivacyConfigured;
  if (!core) return 'NOT_CONFIGURED';
  if (input.scanningEnvironment !== 'production') return 'CONFIGURED_BUT_UNAVAILABLE';
  if (!input.humanApproved) return 'VERIFIED';
  if (!input.scanningLiveEnabled) return 'VERIFIED_BUT_DISABLED';
  return 'APPROVED';
}

export function evaluateProductionStorageEnablementGuard(input: {
  nonLocalProductionStorageRegistered: boolean;
  nonMockProductionKmsRegistered: boolean;
  nonMockProductionScannerRegistered: boolean;
  storageEnvironment: 'sandbox' | 'production';
  storageLiveEnabled: boolean;
  kmsLiveEnabled: boolean;
  scanningLiveEnabled: boolean;
  humanApprovedStorage: boolean;
  humanApprovedKms: boolean;
  humanApprovedScanner: boolean;
  legalPrivacyClear: boolean;
  backupPitrReady: boolean;
  residencyPolicyClear: boolean;
  emergencyDisabled: boolean;
  countryPolicyConfigured?: boolean;
}): { can_enable: false | true; checks: StorageEnablementGuardCheck[] } {
  const checks: StorageEnablementGuardCheck[] = [
    {
      id: 'non_local_storage',
      ok: input.nonLocalProductionStorageRegistered,
      detail: input.nonLocalProductionStorageRegistered
        ? 'Non-local production object storage registered'
        : `LocalPrivateObjectStore only — ${NO_PRODUCTION_PRIVATE_STORAGE}`,
    },
    {
      id: 'non_mock_kms',
      ok: input.nonMockProductionKmsRegistered,
      detail: input.nonMockProductionKmsRegistered
        ? 'Non-mock production KMS registered'
        : `Env refs only — ${NO_PRODUCTION_KMS}`,
    },
    {
      id: 'non_mock_scanner',
      ok: input.nonMockProductionScannerRegistered,
      detail: input.nonMockProductionScannerRegistered
        ? 'Non-mock production malware scanner registered'
        : `Sandbox/noop scanner only — ${NO_PRODUCTION_MALWARE_SCANNER}`,
    },
    {
      id: 'storage_environment_production',
      ok: input.storageEnvironment === 'production',
      detail: `OBJECT_STORAGE_ENVIRONMENT=${input.storageEnvironment}`,
    },
    {
      id: 'storage_live_flag',
      ok: input.storageLiveEnabled,
      detail: input.storageLiveEnabled
        ? 'OBJECT_STORAGE_LIVE_ENABLED=true'
        : 'OBJECT_STORAGE_LIVE_ENABLED is not true',
    },
    {
      id: 'kms_live_flag',
      ok: input.kmsLiveEnabled,
      detail: input.kmsLiveEnabled ? 'KMS_LIVE_ENABLED=true' : 'KMS_LIVE_ENABLED is not true',
    },
    {
      id: 'scanning_live_flag',
      ok: input.scanningLiveEnabled,
      detail: input.scanningLiveEnabled
        ? 'FILE_SCANNING_LIVE_ENABLED=true'
        : 'FILE_SCANNING_LIVE_ENABLED is not true',
    },
    {
      id: 'human_approved_rails',
      ok: input.humanApprovedStorage && input.humanApprovedKms && input.humanApprovedScanner,
      detail:
        input.humanApprovedStorage && input.humanApprovedKms && input.humanApprovedScanner
          ? 'Human approvals recorded for storage/KMS/scanner'
          : 'PROVIDER_APPROVED_OBJECT_STORAGE / KMS / MALWARE_SCANNER missing',
    },
    {
      id: 'legal_privacy_gate',
      ok: input.legalPrivacyClear,
      detail: input.legalPrivacyClear
        ? 'Legal/privacy prerequisites verified'
        : 'Legal/privacy storage gate EXTERNAL_GATED',
    },
    {
      id: 'backup_pitr',
      ok: input.backupPitrReady,
      detail: input.backupPitrReady
        ? 'Backup/PITR dependency ready'
        : 'Backup/PITR EXTERNAL_GATED (local disk is not a backup)',
    },
    {
      id: 'data_residency',
      ok: input.residencyPolicyClear,
      detail: input.residencyPolicyClear
        ? 'Data residency policy configured'
        : 'Data residency POLICY_REQUIRED / LEGAL_REVIEW_REQUIRED',
    },
    {
      id: 'country_policy',
      ok: input.countryPolicyConfigured !== false,
      detail:
        input.countryPolicyConfigured === false
          ? 'Storage/retention country policy POLICY_REQUIRED'
          : 'Retention/residency remain POLICY_DRIVEN / LEGAL_GATED per market',
    },
    {
      id: 'not_emergency_disabled',
      ok: !input.emergencyDisabled,
      detail: input.emergencyDisabled ? 'Emergency disable active' : 'No emergency disable',
    },
  ];
  return { can_enable: checks.every((c) => c.ok) ? true : false, checks };
}

export function buildMalwareScanLifecycleMachine(): MalwareScanLifecycleMachine {
  return {
    success_path: ['UPLOAD', 'QUARANTINE', 'MALWARE_SCAN', 'CLEAN', 'AVAILABLE'],
    exception_states: ['REJECTED', 'INFECTED', 'SCAN_FAILED', 'QUARANTINED'],
    notes: [
      'Reuse existing scan statuses — do not invent a second machine.',
      'DeterministicSandboxMalwareScanner ≠ production AV.',
      'Unscanned objects must never become AVAILABLE in production.',
      'Scanner failure/timeout must never silently mark CLEAN/AVAILABLE.',
      'Scan events are idempotent; terminal results must not be silently overwritten.',
      'CLEAN still requires authorization before download.',
    ],
    never_trust_unscanned: true,
    terminal_overwrite_forbidden: true,
    idempotent_scan_events: true,
    scanner_failure_not_clean: true,
    unscanned_not_available: true,
  };
}

export function listProductionStorageLegalPrivacyGateItems(): StorageLegalGateItem[] {
  return [
    {
      id: 'cloud_bucket_contract',
      status: 'EXTERNAL_GATED',
      owner: 'Platform / Security',
      evidence_required: 'Private bucket/container + IAM + encryption + DPA',
      blocker: NO_PRODUCTION_PRIVATE_STORAGE,
      next_action: 'Procure private object storage; never use local disk for production',
    },
    {
      id: 'kms_secret_manager',
      status: 'EXTERNAL_GATED',
      owner: 'Platform / Security',
      evidence_required: 'Cloud KMS + secret manager + rotation policy',
      blocker: NO_PRODUCTION_KMS,
      next_action: 'Connect KMS; app-level crypto alone is insufficient',
    },
    {
      id: 'malware_scanner_service',
      status: 'EXTERNAL_GATED',
      owner: 'Security',
      evidence_required: 'AV/malware endpoint + quarantine workflow',
      blocker: NO_PRODUCTION_MALWARE_SCANNER,
      next_action: 'Register scanner; never mark unscanned production files clean',
    },
    {
      id: 'retention_deletion',
      status: 'EXTERNAL_GATED',
      owner: 'Privacy / Legal',
      evidence_required: 'Retention/deletion/legal-hold policy by object class',
      blocker: 'RETENTION_POLICY_REQUIRED',
      next_action: 'Do not invent country retention periods',
    },
    {
      id: 'data_residency',
      status: 'EXTERNAL_GATED',
      owner: 'Legal / Compliance',
      evidence_required: 'Country/market residency and transfer decisions',
      blocker: 'LEGAL_REVIEW_REQUIRED',
      next_action: 'Configure policy packs; do not hardcode a single market',
    },
    {
      id: 'backup_pitr_dr',
      status: 'EXTERNAL_GATED',
      owner: 'Platform / SRE',
      evidence_required: 'Managed backup/PITR + restore drill evidence (S63/S74)',
      blocker: 'RECOVERY_INFRASTRUCTURE_EXTERNAL_GATED',
      next_action: 'Local filesystem storage is not disaster recovery',
    },
    {
      id: 'phi_kyc_separation',
      status: 'EXTERNAL_GATED',
      owner: 'Security / Clinical ops',
      evidence_required: 'Classified ACLs separating KYC vs clinical PHI',
      blocker: 'Production classification attestation pending',
      next_action: 'Keep KYC/business docs out of clinical file APIs',
    },
  ];
}

/** Authoritative storage onboarding snapshot — sandbox local store + sandbox scanner only. */
export function evaluateProductionStorageFirstOnboarding(): ProductionStorageFirstOnboardingReport {
  const infraEnv = readInfrastructureEnvironment();
  const storageEnv = readObjectStorageEnvironment();
  const scanEnv = readFileScanningEnvironment();
  const storageLive = isLiveObjectStorageEnabled();
  const scanLive = isLiveFileScanningEnabled();
  const kmsLive = isLiveKmsEnabled();

  const storageActivation = evaluateProviderActivation(getProviderActivationContract('OBJECT_STORAGE'));
  const kmsActivation = evaluateProviderActivation(getProviderActivationContract('KMS'));
  const scannerActivation = evaluateProviderActivation(getProviderActivationContract('MALWARE_SCANNER'));

  const storageGate = evaluateProductionStorageAvailable();
  const scanGate = evaluateProductionFileScanningAvailable();

  const backend = process.env['OBJECT_STORAGE_BACKEND']?.trim() || 'LOCAL';
  const scannerProvider = process.env['MALWARE_SCANNER_PROVIDER']?.trim() || null;
  const kmsProvider = process.env['KMS_PROVIDER']?.trim() || null;

  void isMockOrLocalStorageBackend(backend);
  void isMockScannerProvider(scannerProvider);
  void isMockOrSandboxKmsProvider(kmsProvider);
  void storageGate;
  void scanGate;

  const realStorage = false;
  const realKms = false;
  const realScanner = false;

  const humanStorage =
    process.env['PROVIDER_APPROVED_OBJECT_STORAGE']?.trim().toLowerCase() === 'true';
  const humanKms = process.env['PROVIDER_APPROVED_KMS']?.trim().toLowerCase() === 'true';
  const humanScanner =
    process.env['PROVIDER_APPROVED_MALWARE_SCANNER']?.trim().toLowerCase() === 'true';
  const emergency =
    process.env['PROVIDER_EMERGENCY_DISABLE_ALL']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_OBJECT_STORAGE']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_KMS']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_MALWARE_SCANNER']?.trim().toLowerCase() === 'true';

  const guard = evaluateProductionStorageEnablementGuard({
    nonLocalProductionStorageRegistered: realStorage,
    nonMockProductionKmsRegistered: realKms,
    nonMockProductionScannerRegistered: realScanner,
    storageEnvironment: storageEnv,
    storageLiveEnabled: storageLive,
    kmsLiveEnabled: kmsLive,
    scanningLiveEnabled: scanLive,
    humanApprovedStorage: humanStorage,
    humanApprovedKms: humanKms,
    humanApprovedScanner: humanScanner,
    legalPrivacyClear: false,
    backupPitrReady: false,
    residencyPolicyClear: false,
    emergencyDisabled: emergency,
  });

  const storageValidation = validateObjectStorageConfiguration({
    providerSelected: false,
    nonLocalProductionAdapterRegistered: realStorage,
    storageEnvironment: storageEnv,
    storageLiveEnabled: storageLive,
    humanApproved: humanStorage,
    bucketRefPresent: false,
    secretRefPresent: false,
    privateAclConfigured: false,
    encryptionConfigured: false,
    legalPrivacyConfigured: false,
  });

  const kmsValidation = validateKmsConfiguration({
    providerSelected: false,
    nonMockProductionKmsRegistered: realKms,
    infrastructureEnvironment: infraEnv,
    kmsLiveEnabled: kmsLive,
    humanApproved: humanKms,
    keyRefPresent: false,
    secretManagerRefPresent: false,
    rotationConfigured: false,
    legalPrivacyConfigured: false,
  });

  const scannerValidation = validateMalwareScannerConfiguration({
    providerSelected: false,
    nonMockProductionScannerRegistered: realScanner,
    scanningEnvironment: scanEnv,
    scanningLiveEnabled: scanLive,
    humanApproved: humanScanner,
    endpointRefPresent: false,
    quarantineConfigured: false,
    legalPrivacyConfigured: false,
  });

  const scanMachine = buildMalwareScanLifecycleMachine();

  const configuration_validation = validateProductionStorageConfiguration({
    storageSelected: realStorage,
    kmsSelected: realKms,
    malwareSelected: realScanner,
  });

  const remaining_blockers = [
    NO_PRODUCTION_PRIVATE_STORAGE,
    NO_PRODUCTION_KMS,
    NO_PRODUCTION_MALWARE_SCANNER,
    ...configuration_validation.blockers,
  ];

  return {
    sprint: 95,
    foundation_sprint: 82,
    environment: infraEnv,
    activation_lifecycle: 'NOT_SELECTED',
    object_storage: {
      provider: 'NOT_SELECTED',
      configured: false,
      verified: false,
      approved: false,
      enabled: false,
      validation_status: storageValidation,
      activation_lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_VERIFIED',
      production: 'EXTERNAL_GATED',
      remaining_blocker: NO_PRODUCTION_PRIVATE_STORAGE,
      remaining_blockers: [
        NO_PRODUCTION_PRIVATE_STORAGE,
        ...configuration_validation.blockers.filter((b) => b.startsWith('STORAGE_')),
      ],
      s64_external_blocker: storageActivation.external_blocker,
      activation_stage: storageActivation.stage,
      private_access: 'SANDBOX_VERIFIED',
      signed_url_access: 'SANDBOX_VERIFIED',
      never_fallback_to_local_disk: true,
    },
    kms: {
      provider: 'NOT_SELECTED',
      configured: false,
      verified: false,
      approved: false,
      enabled: false,
      validation_status: kmsValidation,
      activation_lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_ONLY',
      production: 'EXTERNAL_GATED',
      remaining_blocker: NO_PRODUCTION_KMS,
      remaining_blockers: [
        NO_PRODUCTION_KMS,
        ...configuration_validation.blockers.filter((b) => b.startsWith('KMS_')),
      ],
      s64_external_blocker: kmsActivation.external_blocker,
      activation_stage: kmsActivation.stage,
      encryption_at_rest: 'EXTERNAL_GATED',
      key_rotation: 'EXTERNAL_GATED',
      application_encryption_alone_insufficient: true,
    },
    malware_scanning: {
      provider: 'NOT_SELECTED',
      configured: false,
      verified: false,
      approved: false,
      enabled: false,
      validation_status: scannerValidation,
      activation_lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_ONLY',
      production: 'EXTERNAL_GATED',
      remaining_blocker: NO_PRODUCTION_MALWARE_SCANNER,
      remaining_blockers: [
        NO_PRODUCTION_MALWARE_SCANNER,
        ...configuration_validation.blockers.filter((b) => b.startsWith('MALWARE_')),
      ],
      s64_external_blocker: scannerActivation.external_blocker,
      activation_stage: scannerActivation.stage,
      scan_lifecycle: 'SANDBOX_ONLY',
      never_trust_unscanned: true,
      statuses_supported: ['CLEAN', 'INFECTED', 'SCAN_FAILED', 'QUARANTINED'],
    },
    malware_scan_state_machine: scanMachine,
    private_access: 'SANDBOX_VERIFIED',
    signed_url_model: 'OPAQUE_TICKET_SHORT_LIVED_SANDBOX_VERIFIED',
    retention: 'RETENTION_POLICY_REQUIRED',
    backup_pitr_dependency: 'EXTERNAL_GATED',
    data_residency: 'POLICY_DRIVEN',
    audit_logging: 'SANDBOX_VERIFIED',
    legal_privacy_gate: 'EXTERNAL_GATED',
    phi_clinical_separation: 'SANDBOX_VERIFIED',
    data_classification: ['PUBLIC', 'PRIVATE', 'SENSITIVE', 'CLINICAL_PHI'],
    scan_lifecycle_stages: ['UPLOAD', 'QUARANTINE', 'MALWARE_SCAN', 'CLEAN', 'REJECTED', 'AVAILABLE'],
    capabilities: {
      sandbox_local_private_store: 'SANDBOX_VERIFIED',
      production_private_bucket: 'EXTERNAL_GATED',
      opaque_access_tickets: 'SANDBOX_VERIFIED',
      permanent_public_urls: 'EXTERNAL_GATED',
      sandbox_deterministic_scanner: 'SANDBOX_ONLY',
      production_av_engine: 'EXTERNAL_GATED',
      cloud_kms: 'EXTERNAL_GATED',
      tenant_isolation: 'SANDBOX_VERIFIED',
      emergency_disable: 'SANDBOX_VERIFIED',
      retention_policy: 'RETENTION_POLICY_REQUIRED',
      backup_pitr: 'EXTERNAL_GATED',
      data_residency: 'LEGAL_REVIEW_REQUIRED',
      kyc_document_storage: 'SANDBOX_VERIFIED',
      clinical_report_storage: 'SANDBOX_VERIFIED',
    },
    real_object_storage_available: realStorage,
    real_kms_available: realKms,
    real_malware_scanner_available: realScanner,
    runtime_adapters: {
      object_storage: 'local_private_object_store',
      malware_scanner: 'deterministic_sandbox',
      kms: 'env_refs_only',
    },
    remaining_blocker: NO_PRODUCTION_PRIVATE_STORAGE,
    remaining_blockers,
    next_action:
      'Supply private cloud storage + KMS/secret manager + malware scanner endpoint refs; clear legal/privacy/residency/retention; attest backup/PITR; set PROVIDER_APPROVED_* then live flags only after enablement guard. Local disk and sandbox scanner are not production.',
    enablement_guard: guard,
    configuration_validation,
    force_launch_available: false,
    country_policy: {
      status: 'POLICY_DRIVEN',
      hardcoded_market: false,
      markets_supported_for_evaluation: ['GLOBAL', 'IN', 'AE', 'US'],
      note: 'Retention/residency remain policy packs — do not invent legal retention periods.',
    },
    legal_gate_items: listProductionStorageLegalPrivacyGateItems(),
    permission_model: {
      tenant_isolation: true,
      cross_partner_document_isolation: true,
      no_anonymous_private_access: true,
      admin_activation_not_universal_document_access: true,
      retired_objects_not_retrievable: true,
      expired_ticket_rejected: true,
    },
    observability: {
      audit_events: true,
      correlation_id: true,
      no_secrets_or_tickets_in_logs: true,
      no_phi_document_dumps: true,
      not_selected_suppresses_false_outage: true,
    },
    failure_modes: {
      scanner_unavailable_not_clean: true,
      scanner_timeout_not_clean: true,
      rejected_not_available: true,
      duplicate_scan_idempotent: true,
    },
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    signed_urls_printed: false,
    kms_material_printed: false,
    document_contents_printed: false,
    phi_printed: false,
    fake_storage_provider_invented: false,
    fake_kms_key_invented: false,
    fake_malware_scanner_invented: false,
    message:
      'No production private storage, KMS, or malware scanner selected (NO_PRODUCTION_PRIVATE_STORAGE / NO_PRODUCTION_KMS / NO_PRODUCTION_MALWARE_SCANNER). Sandbox LocalPrivateObjectStore + opaque tickets + DeterministicSandboxMalwareScanner remain available. Production uploads fail closed without private storage. Local disk is never a production fallback.',
  };
}

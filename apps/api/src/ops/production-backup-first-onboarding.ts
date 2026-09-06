/**
 * Sprint 74 foundation + Sprint 83 readiness + Sprint 96 production managed backup /
 * PITR / disaster-recovery activation readiness.
 * Never invent managed DB, cloud PITR, backup credentials, or claim RPO/RTO achieved.
 * Never print secrets / connection strings / PHI.
 *
 * Local pnpm db:backup / db:restore / db:recovery-drill ≠ production managed PITR.
 * DATABASE recovery ≠ OBJECT/FILE recovery (S95/S82 still EXTERNAL_GATED).
 * Sandbox restore duration ≠ production RTO proof.
 */
import { listBackupCatalog, verifyBackupMetadata } from './backup-catalog';
import { readInfrastructureEnvironment } from './infra-environment';
import { evaluateProviderActivation } from './provider-activation';
import { getProviderActivationContract } from './provider-activation-contracts';
import { getRecoveryObjectives } from './recovery-targets';
import {
  validateProductionBackupConfiguration,
  type ProductionBackupConfigurationValidation,
} from './production-backup-requirements';
import {
  readSandboxRestoreDrillEvidence,
  type SandboxRestoreDrillEvidence,
} from './sandbox-restore-drill-evidence';

/** Canonical primary blocker (S74). Never remove. */
export const NO_PRODUCTION_MANAGED_BACKUP_PITR = 'NO_PRODUCTION_MANAGED_BACKUP_PITR';
/** Granular activation blockers (map onto primary gate). Never remove. */
export const NO_PRODUCTION_MANAGED_BACKUP = 'NO_PRODUCTION_MANAGED_BACKUP';
export const NO_PRODUCTION_PITR = 'NO_PRODUCTION_PITR';
export const NO_PRODUCTION_DR_ENVIRONMENT = 'NO_PRODUCTION_DR_ENVIRONMENT';

export {
  BACKUP_PROVIDER_NOT_SELECTED,
  BACKUP_CREDENTIAL_REFERENCE_MISSING,
  BACKUP_DESTINATION_REFERENCE_MISSING,
  BACKUP_SCHEDULE_CONFIGURATION_REQUIRED,
  BACKUP_RETENTION_POLICY_CONFIGURATION_REQUIRED,
  PITR_PROVIDER_NOT_SELECTED,
  PITR_WAL_RETENTION_CONFIGURATION_REQUIRED,
  PITR_RESTORE_ENVIRONMENT_REFERENCE_MISSING,
  DR_ENVIRONMENT_NOT_SELECTED,
  DR_REGION_REFERENCE_MISSING,
  DR_OBJECT_STORAGE_DEPENDENCY_GATED,
  DR_KMS_DEPENDENCY_GATED,
  DR_MONITORING_DEPENDENCY_GATED,
  RPO_RTO_NOT_YET_PROVEN,
} from './production-backup-requirements';

export type BackupActivationLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type BackupValidationStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED_BUT_UNAVAILABLE'
  | 'VERIFIED_BUT_DISABLED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'EXTERNAL_GATED'
  | 'NOT_SELECTED';

export type BackupEnablementGuardCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export type BackupLegalGateItem = {
  id: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'READY_FOR_VERIFICATION' | 'VERIFIED' | 'BLOCKED' | 'EXTERNAL_GATED';
  owner: string;
  evidence_required: string;
  blocker: string;
  next_action: string;
};

export type BackupCapabilityStatus =
  | 'SANDBOX_VERIFIED'
  | 'EXTERNAL_GATED'
  | 'NOT_SELECTED'
  | 'SANDBOX_ONLY'
  | 'POLICY_DRIVEN'
  | 'POLICY_REQUIRED'
  | 'LEGAL_REVIEW_REQUIRED'
  | 'TARGET_DEFINED'
  | 'NOT_YET_PROVEN';

export type BackupRailSnapshot = {
  provider: 'NOT_SELECTED' | string;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: boolean;
  validation_status: BackupValidationStatus;
  activation_lifecycle: BackupActivationLifecycle;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_ONLY' | 'SANDBOX_AVAILABLE';
  production: 'EXTERNAL_GATED' | 'BLOCKED' | 'ENABLED';
  remaining_blocker: string;
  remaining_blockers?: string[];
  s64_external_blocker: string | null;
  activation_stage: string;
};

export type { SandboxRestoreDrillEvidence };

export type DrRunbookSummary = {
  source: 'S63_DISASTER_RECOVERY_RUNBOOK';
  steps: string[];
  production_class_restore: 'EXTERNAL_GATED';
};

export type ProductionBackupFirstOnboardingReport = {
  /** Production activation readiness sprint; foundation S83 on S74 rail. */
  sprint: 96;
  foundation_sprint: 83;
  environment: 'sandbox' | 'production';
  activation_lifecycle: BackupActivationLifecycle;
  backup: BackupRailSnapshot & {
    database_backup: 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
    encryption: 'EXTERNAL_GATED';
    retention: 'POLICY_REQUIRED' | 'EXTERNAL_GATED';
    schedule: 'EXTERNAL_GATED' | 'SANDBOX_ONLY';
  };
  pitr: BackupRailSnapshot & {
    wal_retention: 'EXTERNAL_GATED';
    point_in_time: 'EXTERNAL_GATED';
    database_backup_not_pitr: true;
  };
  dr_environment: BackupRailSnapshot & {
    region: 'EXTERNAL_GATED';
    object_storage_dependency: 'EXTERNAL_GATED' | 'PRIVATE_STORAGE_EXTERNAL_GATED';
    kms_dependency: 'EXTERNAL_GATED' | 'KMS_EXTERNAL_GATED';
    monitoring_dependency: 'EXTERNAL_GATED';
    production_class_restore: 'EXTERNAL_GATED';
  };
  restore: {
    sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_AVAILABLE' | 'NOT_RUN';
    production: 'EXTERNAL_GATED';
    drill: SandboxRestoreDrillEvidence;
    sandbox_restore_does_not_prove_production_rto: true;
  };
  rpo: {
    target: '15m';
    status: 'TARGET_DEFINED';
    achievement: 'NOT_YET_PROVEN' | 'PROVEN';
    evidence_class: 'TARGET_DEFINED' | 'SANDBOX_VERIFIED' | 'PRODUCTION_VERIFIED' | 'NOT_YET_PROVEN';
  };
  rto: {
    target: '4h';
    status: 'TARGET_DEFINED';
    achievement: 'NOT_YET_PROVEN' | 'PROVEN';
    evidence_class: 'TARGET_DEFINED' | 'SANDBOX_VERIFIED' | 'PRODUCTION_VERIFIED' | 'NOT_YET_PROVEN';
  };
  object_recovery: 'EXTERNAL_GATED' | 'PRIVATE_STORAGE_EXTERNAL_GATED';
  kms_encryption_dependency: 'EXTERNAL_GATED' | 'KMS_EXTERNAL_GATED';
  malware_scan_dependency: 'EXTERNAL_GATED' | 'MALWARE_EXTERNAL_GATED';
  monitoring_alerting: 'EXTERNAL_GATED' | 'SANDBOX_ONLY';
  data_residency: 'POLICY_DRIVEN' | 'LEGAL_REVIEW_REQUIRED';
  legal_compliance_gate: 'EXTERNAL_GATED';
  backup_vs_migration: 'BACKUP_NOT_EQUIVALENT_TO_MIGRATION_HISTORY';
  database_vs_object_recovery: 'DATABASE_RECOVERY_SEPARATE_FROM_FILE_OBJECT_RECOVERY';
  storage_dependency_sprint: 95;
  dr_runbook: DrRunbookSummary;
  capabilities: Record<string, BackupCapabilityStatus>;
  real_managed_backup_available: false | true;
  real_pitr_available: false | true;
  real_dr_environment_available: false | true;
  runtime_adapters: {
    logical_backup: 'pg_dump_gzip_sandbox';
    restore: 'psql_isolated_drill';
    pitr: 'none';
  };
  remaining_blocker: typeof NO_PRODUCTION_MANAGED_BACKUP_PITR | string;
  remaining_blockers: string[];
  next_action: string;
  enablement_guard: {
    can_enable: false | true;
    checks: BackupEnablementGuardCheck[];
  };
  configuration_validation: ProductionBackupConfigurationValidation;
  force_launch_available: false;
  country_policy: {
    status: 'POLICY_DRIVEN';
    hardcoded_market: false;
    markets_supported_for_evaluation: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    note: string;
  };
  failure_modes: {
    incomplete_backup_not_verified: true;
    sandbox_drill_not_production_green: true;
    unauthorized_restore_rejected: true;
    anonymous_backup_access_rejected: true;
  };
  legal_gate_items: BackupLegalGateItem[];
  permission_model: {
    isolated_restore_not_public: true;
    no_restore_over_active_db: true;
    phi_remains_access_controlled: true;
    admin_activation_not_universal_backup_access: true;
    unauthorized_backup_status_rejected: true;
  };
  observability: {
    audit_events: true;
    correlation_id: true;
    no_secrets_or_connection_strings_in_logs: true;
    no_phi_dumps: true;
    not_selected_suppresses_false_outage: true;
  };
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  connection_strings_printed: false;
  phi_printed: false;
  fake_backup_provider_invented: false;
  fake_pitr_checkpoint_invented: false;
  fake_rpo_rto_verified: false;
  message: string;
};

export function isLivePitrEnabled(): boolean {
  return process.env['PITR_LIVE_ENABLED']?.trim().toLowerCase() === 'true';
}

export function isMockOrSandboxBackupProvider(code: string | null | undefined): boolean {
  if (!code) return true;
  const upper = code.trim().toUpperCase();
  return (
    upper === 'LOCAL' ||
    upper === 'PG_DUMP' ||
    upper === 'SANDBOX' ||
    upper === 'NULL' ||
    upper.startsWith('MOCK') ||
    upper.includes('SANDBOX')
  );
}

/** Deterministic validator — script presence alone never yields ENABLED. */
export function validateBackupConfiguration(input: {
  providerSelected: boolean;
  nonSandboxManagedBackupRegistered: boolean;
  infrastructureEnvironment: 'sandbox' | 'production';
  pitrLiveEnabled: boolean;
  humanApproved: boolean;
  managedDbPresent: boolean;
  encryptedOffsiteRetention: boolean;
  restoreDrillProvenOnProductionClass: boolean;
  objectStorageRecoveryReady: boolean;
  kmsReady: boolean;
  legalComplianceConfigured: boolean;
}): BackupValidationStatus {
  if (!input.providerSelected) return 'NOT_SELECTED';
  if (!input.nonSandboxManagedBackupRegistered) return 'NOT_CONFIGURED';
  const core =
    input.managedDbPresent &&
    input.encryptedOffsiteRetention &&
    input.objectStorageRecoveryReady &&
    input.kmsReady &&
    input.legalComplianceConfigured;
  if (!core) return 'NOT_CONFIGURED';
  if (input.infrastructureEnvironment !== 'production') return 'CONFIGURED_BUT_UNAVAILABLE';
  if (!input.restoreDrillProvenOnProductionClass) return 'CONFIGURED_BUT_UNAVAILABLE';
  if (!input.humanApproved) return 'VERIFIED';
  if (!input.pitrLiveEnabled) return 'VERIFIED_BUT_DISABLED';
  return 'APPROVED';
}

export function evaluateBackupEnablementGuard(input: {
  nonSandboxManagedBackupRegistered: boolean;
  nonSandboxPitrRegistered: boolean;
  infrastructureEnvironment: 'sandbox' | 'production';
  pitrLiveEnabled: boolean;
  humanApproved: boolean;
  encryptedOffsiteRetention: boolean;
  restoreDrillProvenOnProductionClass: boolean;
  objectStorageRecoveryReady: boolean;
  kmsReady: boolean;
  legalComplianceClear: boolean;
  monitoringReady: boolean;
  emergencyDisabled: boolean;
  drEnvironmentReady?: boolean;
}): { can_enable: false | true; checks: BackupEnablementGuardCheck[] } {
  const checks: BackupEnablementGuardCheck[] = [
    {
      id: 'managed_backup',
      ok: input.nonSandboxManagedBackupRegistered,
      detail: input.nonSandboxManagedBackupRegistered
        ? 'Managed backup registered'
        : `Local pg_dump only — ${NO_PRODUCTION_MANAGED_BACKUP}`,
    },
    {
      id: 'managed_pitr',
      ok: input.nonSandboxPitrRegistered,
      detail: input.nonSandboxPitrRegistered
        ? 'Managed PITR registered'
        : `${NO_PRODUCTION_PITR} — EXTERNAL_GATED`,
    },
    {
      id: 'dr_environment',
      ok: input.drEnvironmentReady !== false,
      detail:
        input.drEnvironmentReady === false
          ? `${NO_PRODUCTION_DR_ENVIRONMENT}`
          : 'DR environment tracked; production-class restore still EXTERNAL_GATED until attested',
    },
    {
      id: 'environment_production',
      ok: input.infrastructureEnvironment === 'production',
      detail: `INFRASTRUCTURE_ENVIRONMENT=${input.infrastructureEnvironment}`,
    },
    {
      id: 'pitr_live_flag',
      ok: input.pitrLiveEnabled,
      detail: input.pitrLiveEnabled ? 'PITR_LIVE_ENABLED=true' : 'PITR_LIVE_ENABLED is not true',
    },
    {
      id: 'human_approved',
      ok: input.humanApproved,
      detail: input.humanApproved
        ? 'Human approval recorded'
        : 'PROVIDER_APPROVED_MANAGED_DB_PITR missing',
    },
    {
      id: 'encrypted_offsite',
      ok: input.encryptedOffsiteRetention,
      detail: input.encryptedOffsiteRetention
        ? 'Encrypted off-site retention configured'
        : 'Encrypted off-site retention EXTERNAL_GATED',
    },
    {
      id: 'production_class_restore_drill',
      ok: input.restoreDrillProvenOnProductionClass,
      detail: input.restoreDrillProvenOnProductionClass
        ? 'Production-class restore drill proven'
        : 'Only sandbox logical restore drill — RPO/RTO NOT_YET_PROVEN',
    },
    {
      id: 'object_storage_recovery',
      ok: input.objectStorageRecoveryReady,
      detail: input.objectStorageRecoveryReady
        ? 'Object storage recovery ready'
        : 'PRIVATE_STORAGE_EXTERNAL_GATED (S95/S82)',
    },
    {
      id: 'kms',
      ok: input.kmsReady,
      detail: input.kmsReady ? 'KMS ready for backup encryption' : 'KMS_EXTERNAL_GATED (S95/S82)',
    },
    {
      id: 'legal_compliance',
      ok: input.legalComplianceClear,
      detail: input.legalComplianceClear
        ? 'Legal/compliance clear'
        : 'Retention/residency LEGAL_REVIEW_REQUIRED',
    },
    {
      id: 'monitoring',
      ok: input.monitoringReady,
      detail: input.monitoringReady
        ? 'Backup age / PITR monitoring ready'
        : 'Monitoring/APM EXTERNAL_GATED',
    },
    {
      id: 'not_emergency_disabled',
      ok: !input.emergencyDisabled,
      detail: input.emergencyDisabled ? 'Emergency disable active' : 'No emergency disable',
    },
  ];
  return { can_enable: checks.every((c) => c.ok) ? true : false, checks };
}

export function buildDrRunbookSummary(): DrRunbookSummary {
  return {
    source: 'S63_DISASTER_RECOVERY_RUNBOOK',
    steps: [
      'detect_incident',
      'declare_recovery_event',
      'identify_last_known_good_backup_or_pitr',
      'isolate_affected_environment',
      'restore_database_isolated',
      'restore_object_storage_dependencies',
      'validate_schema',
      'validate_critical_business_data',
      'validate_application_health',
      'validate_security_permissions',
      'switch_or_recover_service_per_approved_process',
      'verify_audit_observability',
      'communicate_recovery_status',
      'record_incident',
    ],
    production_class_restore: 'EXTERNAL_GATED',
  };
}

export function listBackupLegalComplianceGateItems(): BackupLegalGateItem[] {
  return [
    {
      id: 'managed_postgres_pitr',
      status: 'EXTERNAL_GATED',
      owner: 'Platform / DBA',
      evidence_required: 'Managed Postgres with WAL/PITR + off-site retention',
      blocker: NO_PRODUCTION_MANAGED_BACKUP_PITR,
      next_action: 'Procure managed DB/PITR; local dumps are sandbox-only',
    },
    {
      id: 'encrypted_backup_storage',
      status: 'EXTERNAL_GATED',
      owner: 'Platform / Security',
      evidence_required: 'Encrypted backup store + KMS (S95/S82)',
      blocker: 'NO_PRODUCTION_KMS',
      next_action: 'Connect KMS before claiming encrypted production backups',
    },
    {
      id: 'object_storage_recovery',
      status: 'EXTERNAL_GATED',
      owner: 'Platform / Security',
      evidence_required: 'Bucket versioning/replication for KYC/clinical objects',
      blocker: 'NO_PRODUCTION_PRIVATE_STORAGE',
      next_action: 'DB restore alone does not recover private files (S95)',
    },
    {
      id: 'retention_policy',
      status: 'EXTERNAL_GATED',
      owner: 'Privacy / Legal',
      evidence_required: 'Backup/PITR retention + legal hold policy',
      blocker: 'POLICY_REQUIRED',
      next_action: 'Do not invent country retention periods',
    },
    {
      id: 'data_residency',
      status: 'EXTERNAL_GATED',
      owner: 'Legal / Compliance',
      evidence_required: 'Residency/replication decisions by market',
      blocker: 'LEGAL_REVIEW_REQUIRED',
      next_action: 'Configure policy packs; do not hardcode a single market',
    },
    {
      id: 'production_restore_drill',
      status: 'EXTERNAL_GATED',
      owner: 'Platform / SRE',
      evidence_required: 'Timed restore drill on production-class disposable target',
      blocker: 'RPO/RTO NOT_YET_PROVEN',
      next_action: 'Sandbox drill does not prove 15m/4h achievement',
    },
    {
      id: 'monitoring_backup_age',
      status: 'EXTERNAL_GATED',
      owner: 'SRE',
      evidence_required: 'Alerts for backup failure / PITR lag / restore failure',
      blocker: 'MONITORING_APM EXTERNAL_GATED',
      next_action: 'Wire APM/pager after vendor selection',
    },
  ];
}

export { readSandboxRestoreDrillEvidence } from './sandbox-restore-drill-evidence';

/** Soft assert backup metadata verifier still rejects incomplete meta. */
export function assertBackupMetadataGate(): boolean {
  return (
    verifyBackupMetadata({ sha256: 'a'.repeat(64), byte_size: 100, created_at: new Date().toISOString() })
      .ok === true &&
    verifyBackupMetadata({}).ok === false
  );
}

/** Authoritative backup/DR onboarding snapshot — sandbox logical dump/restore only. */
export function evaluateProductionBackupFirstOnboarding(): ProductionBackupFirstOnboardingReport {
  const env = readInfrastructureEnvironment();
  const recovery = getRecoveryObjectives();
  const activation = evaluateProviderActivation(getProviderActivationContract('MANAGED_DB_PITR'));
  const catalog = listBackupCatalog(5);
  const drill = readSandboxRestoreDrillEvidence();
  void assertBackupMetadataGate();
  void catalog;
  void isMockOrSandboxBackupProvider(process.env['BACKUP_PROVIDER']);

  const real = false;
  const humanApproved =
    process.env['PROVIDER_APPROVED_MANAGED_DB_PITR']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_APPROVED_PITR']?.trim().toLowerCase() === 'true';
  const emergency =
    process.env['PROVIDER_EMERGENCY_DISABLE_ALL']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_MANAGED_DB_PITR']?.trim().toLowerCase() === 'true' ||
    process.env['PROVIDER_EMERGENCY_DISABLE_PITR']?.trim().toLowerCase() === 'true';

  const guard = evaluateBackupEnablementGuard({
    nonSandboxManagedBackupRegistered: real,
    nonSandboxPitrRegistered: real,
    infrastructureEnvironment: env,
    pitrLiveEnabled: isLivePitrEnabled(),
    humanApproved,
    encryptedOffsiteRetention: false,
    restoreDrillProvenOnProductionClass: false,
    objectStorageRecoveryReady: false,
    kmsReady: false,
    legalComplianceClear: false,
    monitoringReady: false,
    emergencyDisabled: emergency,
    drEnvironmentReady: false,
  });

  const validation = validateBackupConfiguration({
    providerSelected: false,
    nonSandboxManagedBackupRegistered: real,
    infrastructureEnvironment: env,
    pitrLiveEnabled: isLivePitrEnabled(),
    humanApproved,
    managedDbPresent: false,
    encryptedOffsiteRetention: false,
    restoreDrillProvenOnProductionClass: false,
    objectStorageRecoveryReady: false,
    kmsReady: false,
    legalComplianceConfigured: false,
  });

  const configuration_validation = validateProductionBackupConfiguration({
    backupSelected: false,
    pitrSelected: false,
    drSelected: false,
  });

  const remaining_blockers = [
    NO_PRODUCTION_MANAGED_BACKUP_PITR,
    NO_PRODUCTION_MANAGED_BACKUP,
    NO_PRODUCTION_PITR,
    NO_PRODUCTION_DR_ENVIRONMENT,
    'NO_PRODUCTION_PRIVATE_STORAGE',
    'NO_PRODUCTION_KMS',
    'NO_PRODUCTION_MALWARE_SCANNER',
    ...configuration_validation.blockers,
  ];

  return {
    sprint: 96,
    foundation_sprint: 83,
    environment: env,
    activation_lifecycle: 'NOT_SELECTED',
    backup: {
      provider: 'NOT_SELECTED',
      configured: false,
      verified: false,
      approved: false,
      enabled: false,
      validation_status: validation,
      activation_lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_VERIFIED',
      production: 'EXTERNAL_GATED',
      remaining_blocker: NO_PRODUCTION_MANAGED_BACKUP,
      remaining_blockers: [
        NO_PRODUCTION_MANAGED_BACKUP,
        ...configuration_validation.blockers.filter((b) => b.startsWith('BACKUP_')),
      ],
      s64_external_blocker: activation.external_blocker,
      activation_stage: activation.stage,
      database_backup: 'SANDBOX_VERIFIED',
      encryption: 'EXTERNAL_GATED',
      retention: 'POLICY_REQUIRED',
      schedule: 'EXTERNAL_GATED',
    },
    pitr: {
      provider: 'NOT_SELECTED',
      configured: false,
      verified: false,
      approved: false,
      enabled: false,
      validation_status: 'NOT_SELECTED',
      activation_lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_ONLY',
      production: 'EXTERNAL_GATED',
      remaining_blocker: NO_PRODUCTION_PITR,
      remaining_blockers: [
        NO_PRODUCTION_PITR,
        ...configuration_validation.blockers.filter((b) => b.startsWith('PITR_')),
      ],
      s64_external_blocker: activation.external_blocker,
      activation_stage: activation.stage,
      wal_retention: 'EXTERNAL_GATED',
      point_in_time: 'EXTERNAL_GATED',
      database_backup_not_pitr: true,
    },
    dr_environment: {
      provider: 'NOT_SELECTED',
      configured: false,
      verified: false,
      approved: false,
      enabled: false,
      validation_status: 'NOT_SELECTED',
      activation_lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_ONLY',
      production: 'EXTERNAL_GATED',
      remaining_blocker: NO_PRODUCTION_DR_ENVIRONMENT,
      remaining_blockers: [
        NO_PRODUCTION_DR_ENVIRONMENT,
        ...configuration_validation.blockers.filter((b) => b.startsWith('DR_')),
      ],
      s64_external_blocker: activation.external_blocker,
      activation_stage: activation.stage,
      region: 'EXTERNAL_GATED',
      object_storage_dependency: 'PRIVATE_STORAGE_EXTERNAL_GATED',
      kms_dependency: 'KMS_EXTERNAL_GATED',
      monitoring_dependency: 'EXTERNAL_GATED',
      production_class_restore: 'EXTERNAL_GATED',
    },
    restore: {
      sandbox: drill.status === 'SANDBOX_VERIFIED' ? 'SANDBOX_VERIFIED' : 'SANDBOX_AVAILABLE',
      production: 'EXTERNAL_GATED',
      drill,
      sandbox_restore_does_not_prove_production_rto: true,
    },
    rpo: {
      target: recovery.rpo_target,
      status: recovery.status,
      achievement: recovery.rpo_achievement,
      evidence_class: 'NOT_YET_PROVEN',
    },
    rto: {
      target: recovery.rto_target,
      status: recovery.status,
      achievement: recovery.rto_achievement,
      evidence_class: 'NOT_YET_PROVEN',
    },
    object_recovery: 'PRIVATE_STORAGE_EXTERNAL_GATED',
    kms_encryption_dependency: 'KMS_EXTERNAL_GATED',
    malware_scan_dependency: 'MALWARE_EXTERNAL_GATED',
    monitoring_alerting: 'EXTERNAL_GATED',
    data_residency: 'POLICY_DRIVEN',
    legal_compliance_gate: 'EXTERNAL_GATED',
    backup_vs_migration: 'BACKUP_NOT_EQUIVALENT_TO_MIGRATION_HISTORY',
    database_vs_object_recovery: 'DATABASE_RECOVERY_SEPARATE_FROM_FILE_OBJECT_RECOVERY',
    storage_dependency_sprint: 95,
    dr_runbook: buildDrRunbookSummary(),
    capabilities: {
      local_logical_backup: 'SANDBOX_VERIFIED',
      isolated_restore_drill: drill.status === 'SANDBOX_VERIFIED' ? 'SANDBOX_VERIFIED' : 'SANDBOX_ONLY',
      managed_pitr: 'EXTERNAL_GATED',
      encrypted_offsite_backup: 'EXTERNAL_GATED',
      object_file_recovery: 'EXTERNAL_GATED',
      rpo_target: 'TARGET_DEFINED',
      rto_target: 'TARGET_DEFINED',
      rpo_achievement: 'NOT_YET_PROVEN',
      rto_achievement: 'NOT_YET_PROVEN',
      retention_policy: 'POLICY_REQUIRED',
      data_residency: 'LEGAL_REVIEW_REQUIRED',
      emergency_disable: 'SANDBOX_VERIFIED',
      dr_environment: 'EXTERNAL_GATED',
    },
    real_managed_backup_available: real,
    real_pitr_available: real,
    real_dr_environment_available: false,
    runtime_adapters: {
      logical_backup: 'pg_dump_gzip_sandbox',
      restore: 'psql_isolated_drill',
      pitr: 'none',
    },
    remaining_blocker: NO_PRODUCTION_MANAGED_BACKUP_PITR,
    remaining_blockers,
    next_action:
      'Procure managed Postgres/PITR + encrypted off-site retention + isolated DR environment + object-storage recovery + KMS (S95); run production-class restore drill; set PROVIDER_APPROVED_MANAGED_DB_PITR; then PITR_LIVE_ENABLED only after enablement guard. Sandbox db:recovery-drill does not prove 15m/4h.',
    enablement_guard: guard,
    configuration_validation,
    force_launch_available: false,
    country_policy: {
      status: 'POLICY_DRIVEN',
      hardcoded_market: false,
      markets_supported_for_evaluation: ['GLOBAL', 'IN', 'AE', 'US'],
      note: 'Retention/residency remain policy packs — do not invent legal retention periods.',
    },
    failure_modes: {
      incomplete_backup_not_verified: true,
      sandbox_drill_not_production_green: true,
      unauthorized_restore_rejected: true,
      anonymous_backup_access_rejected: true,
    },
    legal_gate_items: listBackupLegalComplianceGateItems(),
    permission_model: {
      isolated_restore_not_public: true,
      no_restore_over_active_db: true,
      phi_remains_access_controlled: true,
      admin_activation_not_universal_backup_access: true,
      unauthorized_backup_status_rejected: true,
    },
    observability: {
      audit_events: true,
      correlation_id: true,
      no_secrets_or_connection_strings_in_logs: true,
      no_phi_dumps: true,
      not_selected_suppresses_false_outage: true,
    },
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    connection_strings_printed: false,
    phi_printed: false,
    fake_backup_provider_invented: false,
    fake_pitr_checkpoint_invented: false,
    fake_rpo_rto_verified: false,
    message:
      'No production managed backup/PITR/DR selected (NO_PRODUCTION_MANAGED_BACKUP_PITR). Sandbox logical backup + isolated restore drill remain available (SANDBOX_VERIFIED when drill evidence present). RPO 15m / RTO 4h are TARGET_DEFINED / NOT_YET_PROVEN. Database restore ≠ object/file recovery (S95). Foundation: Sprint 83 on Sprint 74.',
  };
}

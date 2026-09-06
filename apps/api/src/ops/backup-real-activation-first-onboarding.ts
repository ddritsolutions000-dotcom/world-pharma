/**
 * Sprint 108 — Real production backup + PITR + DR activation readiness.
 * Composes S63/S74/S83/S96. Never invents managed DB, cloud PITR, DR regions, or credentials.
 * Never claims RPO/RTO proven from sandbox restore. Local pg_dump is never a production backup.
 */
import {
  NO_PRODUCTION_MANAGED_BACKUP_PITR,
  NO_PRODUCTION_MANAGED_BACKUP,
  NO_PRODUCTION_PITR,
  NO_PRODUCTION_DR_ENVIRONMENT,
  evaluateProductionBackupFirstOnboarding,
  type BackupActivationLifecycle,
} from './production-backup-first-onboarding';
import {
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
  validateProductionBackupConfiguration,
} from './production-backup-requirements';
import {
  NO_PRODUCTION_PRIVATE_STORAGE,
  NO_PRODUCTION_KMS,
} from './production-storage-first-onboarding';
import { MONITORING_DEPENDENCY_GATED } from './storage-real-activation-first-onboarding';
import { readSandboxRestoreDrillEvidence } from './sandbox-restore-drill-evidence';
import { getRecoveryObjectives } from './recovery-targets';
import { evaluateProductionFoundationFirstOnboarding } from './production-foundation-first-onboarding';
import { evaluateProductionLaunchControl } from './production-launch-control';

/** Alias wording for backup provider umbrella (canonical: NO_PRODUCTION_MANAGED_BACKUP). */
export const NO_PRODUCTION_BACKUP_PROVIDER = NO_PRODUCTION_MANAGED_BACKUP;

/** PITR config incomplete (complements PITR_PROVIDER_NOT_SELECTED / WAL retention). */
export const PITR_CONFIGURATION_MISSING = 'PITR_CONFIGURATION_MISSING';

/** WAL/archive dependency not proven for production PITR. */
export const PITR_ARCHIVE_DEPENDENCY_GATED = 'PITR_ARCHIVE_DEPENDENCY_GATED';

/** Production DR restore drill not proven. */
export const DR_RESTORE_NOT_PROVEN = 'DR_RESTORE_NOT_PROVEN';

/** RPO/RTO split aliases (canonical combined: RPO_RTO_NOT_YET_PROVEN). */
export const RPO_NOT_PROVEN = 'RPO_NOT_PROVEN';
export const RTO_NOT_PROVEN = 'RTO_NOT_PROVEN';

/** Backup encryption depends on production KMS (S107). */
export const BACKUP_ENCRYPTION_DEPENDENCY_GATED = 'BACKUP_ENCRYPTION_DEPENDENCY_GATED';

/** Backup destination depends on production private storage (S107). */
export const BACKUP_STORAGE_DEPENDENCY_GATED = 'BACKUP_STORAGE_DEPENDENCY_GATED';

export {
  NO_PRODUCTION_MANAGED_BACKUP_PITR,
  NO_PRODUCTION_MANAGED_BACKUP,
  NO_PRODUCTION_PITR,
  NO_PRODUCTION_DR_ENVIRONMENT,
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
  MONITORING_DEPENDENCY_GATED,
};

export type RealBackupLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURATION_REQUIRED'
  | 'CREDENTIALS_REQUIRED'
  | 'VERIFICATION_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'READY_FOR_ACTIVATION'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type RealBackupMarketStatus = {
  market: 'GLOBAL' | 'IN' | 'AE' | 'US';
  lifecycle: RealBackupLifecycle;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_ONLY';
  production: 'PRODUCTION_EXTERNAL_GATED' | 'ENABLED';
  blocker: string;
};

export type RealBackupChecklistItem = {
  id: string;
  label: string;
  mandatory: boolean;
  status: 'MISSING' | 'PRESENT' | 'PENDING' | 'N/A';
};

export type RealBackupRailStatus = {
  rail: 'MANAGED_BACKUP' | 'PITR' | 'DR_ENVIRONMENT';
  provider: 'NOT_SELECTED';
  real_provider_selected: false;
  production_enabled: false;
  lifecycle: RealBackupLifecycle;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_ONLY';
  production: 'EXTERNAL_GATED';
  blocker: string;
};

function mapLifecycle(s96: BackupActivationLifecycle): RealBackupLifecycle {
  if (s96 === 'ENABLED') return 'ENABLED';
  if (s96 === 'DISABLED') return 'DISABLED';
  if (s96 === 'NOT_SELECTED') return 'NOT_SELECTED';
  if (s96 === 'APPROVED') return 'APPROVAL_REQUIRED';
  if (s96 === 'VERIFIED') return 'VERIFICATION_REQUIRED';
  if (s96 === 'CONFIGURED') return 'CONFIGURATION_REQUIRED';
  return 'EXTERNAL_GATED';
}

export function buildRealBackupActivationChecklist(): RealBackupChecklistItem[] {
  const v = validateProductionBackupConfiguration();
  const drill = readSandboxRestoreDrillEvidence();
  return [
    {
      id: 'backup_provider_selected',
      label: 'Real production backup provider selected?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'backup_credentials',
      label: 'Backup credentials via approved secret manager?',
      mandatory: true,
      status: v.credential_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'backup_destination',
      label: 'Encrypted backup destination configured?',
      mandatory: true,
      status: v.destination_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'backup_schedule',
      label: 'Automated backup schedule configured?',
      mandatory: true,
      status: v.schedule_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'backup_retention',
      label: 'Backup retention policy configured?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'backup_encryption',
      label: 'Backup encryption / KMS dependency ready?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'storage_dependency',
      label: 'Production private storage dependency (S107) ready?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'pitr_configured',
      label: 'PITR / WAL archive configured?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'pitr_restore_env',
      label: 'PITR restore environment reference configured?',
      mandatory: true,
      status: v.restore_environment_reference.reference_present ? 'PRESENT' : 'MISSING',
    },
    {
      id: 'dr_environment',
      label: 'DR environment selected?',
      mandatory: true,
      status: 'MISSING',
    },
    {
      id: 'monitoring',
      label: 'Backup/PITR monitoring + alerting configured?',
      mandatory: true,
      status: 'PENDING',
    },
    {
      id: 'sandbox_isolated_restore',
      label: 'Sandbox isolated restore drill evidence?',
      mandatory: true,
      status: drill.status === 'SANDBOX_VERIFIED' ? 'PRESENT' : 'PENDING',
    },
    {
      id: 'production_restore_proven',
      label: 'Production restore / RPO/RTO proven?',
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
      id: 'production_activation',
      label: 'Production backup/PITR/DR enabled?',
      mandatory: true,
      status: 'MISSING',
    },
  ];
}

export function buildRealBackupMarketStatuses(): RealBackupMarketStatus[] {
  return (['GLOBAL', 'IN', 'AE', 'US'] as const).map((market) => ({
    market,
    lifecycle: 'NOT_SELECTED' as const,
    sandbox: 'SANDBOX_VERIFIED' as const,
    production: 'PRODUCTION_EXTERNAL_GATED' as const,
    blocker: NO_PRODUCTION_MANAGED_BACKUP_PITR,
  }));
}

export function buildRealBackupRailStatuses(): RealBackupRailStatus[] {
  return [
    {
      rail: 'MANAGED_BACKUP',
      provider: 'NOT_SELECTED',
      real_provider_selected: false,
      production_enabled: false,
      lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_VERIFIED',
      production: 'EXTERNAL_GATED',
      blocker: NO_PRODUCTION_MANAGED_BACKUP,
    },
    {
      rail: 'PITR',
      provider: 'NOT_SELECTED',
      real_provider_selected: false,
      production_enabled: false,
      lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_ONLY',
      production: 'EXTERNAL_GATED',
      blocker: NO_PRODUCTION_PITR,
    },
    {
      rail: 'DR_ENVIRONMENT',
      provider: 'NOT_SELECTED',
      real_provider_selected: false,
      production_enabled: false,
      lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_ONLY',
      production: 'EXTERNAL_GATED',
      blocker: NO_PRODUCTION_DR_ENVIRONMENT,
    },
  ];
}

export type RealBackupFirstOnboardingReport = {
  sprint: 108;
  foundation_sprints: string;
  activation_lifecycle: RealBackupLifecycle;
  environment: 'sandbox' | 'production';
  real_production_backup_provider_selected: false;
  production_backup_enabled: false;
  production_pitr_enabled: false;
  real_production_dr_infrastructure_available: false;
  isolated_restore_test: 'PASS' | 'PENDING' | 'FAIL';
  isolated_restore_scope: 'SANDBOX_ISOLATED';
  rpo: {
    target: '15m';
    status: 'TARGET_DEFINED';
    achievement: 'NOT_YET_PROVEN';
  };
  rto: {
    target: '4h';
    status: 'TARGET_DEFINED';
    achievement: 'NOT_YET_PROVEN';
  };
  production_local_disk_backup_fallback_possible: false;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: false;
  ready_for_activation: false;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_ONLY';
  production: 'EXTERNAL_GATED';
  rails: RealBackupRailStatus[];
  checklist: RealBackupChecklistItem[];
  markets: RealBackupMarketStatus[];
  dr_workflow: {
    steps: string[];
    production_failover: 'EXTERNAL_GATED';
    fake_failover_forbidden: true;
  };
  sandbox_restore: ReturnType<typeof readSandboxRestoreDrillEvidence>;
  dependencies: {
    private_storage: 'EXTERNAL_GATED';
    kms: 'EXTERNAL_GATED';
    monitoring: 'EXTERNAL_GATED';
    storage_sprint: 107;
  };
  security_controls: {
    no_public_backup_access: true;
    no_secrets_in_logs: true;
    restore_rbac: true;
    never_fallback_to_local_pg_dump: true;
    recovery_env_not_public: true;
  };
  configuration_readiness: ReturnType<
    typeof validateProductionBackupConfiguration
  >['configuration_readiness'];
  remaining_blocker: typeof NO_PRODUCTION_MANAGED_BACKUP_PITR;
  remaining_blockers: string[];
  next_action: string;
  force_launch_available: false;
  force_deploy_available: false;
  can_production_launch: 'NO';
  launch_control_overall: string;
  control_plane: 'S100_REUSED';
  foundation_plane: 'S101_REUSED';
  s96_plane: 'COMPOSED';
  s107_plane: 'DEPENDENCY';
  runtime_adapters: {
    backup: 'local_pg_dump_sandbox';
    pitr: 'not_selected';
    dr: 'sandbox_isolated_drill_only';
  };
  evaluated_at: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  connection_strings_printed: false;
  fake_backup_provider_invented: false;
  fake_pitr_invented: false;
  fake_dr_failover_invented: false;
  fake_rpo_rto_proven: false;
  message: string;
};

export function evaluateRealBackupFirstOnboarding(
  input?: { correlation_id?: string },
): RealBackupFirstOnboardingReport {
  const s96 = evaluateProductionBackupFirstOnboarding();
  const foundation = evaluateProductionFoundationFirstOnboarding();
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id: input?.correlation_id,
  });
  const checklist = buildRealBackupActivationChecklist();
  const markets = buildRealBackupMarketStatuses();
  const rails = buildRealBackupRailStatuses();
  const config = validateProductionBackupConfiguration();
  const drill = readSandboxRestoreDrillEvidence();
  const recovery = getRecoveryObjectives();

  const isolated_restore_test: 'PASS' | 'PENDING' | 'FAIL' =
    drill.status === 'SANDBOX_VERIFIED' ? 'PASS' : drill.status === 'FAILED' ? 'FAIL' : 'PENDING';

  const remaining_blockers = [
    NO_PRODUCTION_MANAGED_BACKUP_PITR,
    NO_PRODUCTION_MANAGED_BACKUP,
    NO_PRODUCTION_BACKUP_PROVIDER,
    NO_PRODUCTION_PITR,
    NO_PRODUCTION_DR_ENVIRONMENT,
    BACKUP_PROVIDER_NOT_SELECTED,
    BACKUP_CREDENTIAL_REFERENCE_MISSING,
    BACKUP_DESTINATION_REFERENCE_MISSING,
    BACKUP_SCHEDULE_CONFIGURATION_REQUIRED,
    BACKUP_RETENTION_POLICY_CONFIGURATION_REQUIRED,
    PITR_PROVIDER_NOT_SELECTED,
    PITR_CONFIGURATION_MISSING,
    PITR_WAL_RETENTION_CONFIGURATION_REQUIRED,
    PITR_ARCHIVE_DEPENDENCY_GATED,
    PITR_RESTORE_ENVIRONMENT_REFERENCE_MISSING,
    DR_ENVIRONMENT_NOT_SELECTED,
    DR_REGION_REFERENCE_MISSING,
    DR_RESTORE_NOT_PROVEN,
    DR_OBJECT_STORAGE_DEPENDENCY_GATED,
    DR_KMS_DEPENDENCY_GATED,
    DR_MONITORING_DEPENDENCY_GATED,
    RPO_RTO_NOT_YET_PROVEN,
    RPO_NOT_PROVEN,
    RTO_NOT_PROVEN,
    BACKUP_ENCRYPTION_DEPENDENCY_GATED,
    BACKUP_STORAGE_DEPENDENCY_GATED,
    MONITORING_DEPENDENCY_GATED,
    NO_PRODUCTION_PRIVATE_STORAGE,
    NO_PRODUCTION_KMS,
    ...foundation.remaining_blockers.filter((b) =>
      [
        'NO_PRODUCTION_ENVIRONMENT',
        'NO_PRODUCTION_SECRETS_MANAGER',
        'NO_PRODUCTION_DATABASE',
        'NO_PRODUCTION_DEPLOYMENT_TARGET',
      ].includes(b),
    ),
    ...s96.remaining_blockers.slice(0, 8),
  ];

  return {
    sprint: 108,
    foundation_sprints: '63,74,83,87,96,100,101,107',
    activation_lifecycle: mapLifecycle(s96.activation_lifecycle),
    environment: s96.environment,
    real_production_backup_provider_selected: false,
    production_backup_enabled: false,
    production_pitr_enabled: false,
    real_production_dr_infrastructure_available: false,
    isolated_restore_test,
    isolated_restore_scope: 'SANDBOX_ISOLATED',
    rpo: {
      target: recovery.rpo_target,
      status: 'TARGET_DEFINED',
      achievement: 'NOT_YET_PROVEN',
    },
    rto: {
      target: recovery.rto_target,
      status: 'TARGET_DEFINED',
      achievement: 'NOT_YET_PROVEN',
    },
    production_local_disk_backup_fallback_possible: false,
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    ready_for_activation: false,
    sandbox: drill.status === 'SANDBOX_VERIFIED' ? 'SANDBOX_VERIFIED' : 'SANDBOX_ONLY',
    production: 'EXTERNAL_GATED',
    rails,
    checklist,
    markets,
    dr_workflow: {
      steps: [
        'detect_production_database_failure',
        'declare_recovery_event',
        'identify_latest_valid_recovery_point',
        'restore_to_isolated_recovery_environment',
        'validate_schema_migrations',
        'validate_application_connectivity',
        'validate_critical_data',
        'validate_security_permissions',
        'switch_restore_service_per_approved_runbook',
        'verify_health_readiness',
        'record_recovery_result',
        'document_incident_recovery_evidence',
      ],
      production_failover: 'EXTERNAL_GATED',
      fake_failover_forbidden: true,
    },
    sandbox_restore: drill,
    dependencies: {
      private_storage: 'EXTERNAL_GATED',
      kms: 'EXTERNAL_GATED',
      monitoring: 'EXTERNAL_GATED',
      storage_sprint: 107,
    },
    security_controls: {
      no_public_backup_access: true,
      no_secrets_in_logs: true,
      restore_rbac: true,
      never_fallback_to_local_pg_dump: true,
      recovery_env_not_public: true,
    },
    configuration_readiness: config.configuration_readiness,
    remaining_blocker: NO_PRODUCTION_MANAGED_BACKUP_PITR,
    remaining_blockers: [...new Set(remaining_blockers)],
    next_action:
      'Select managed backup + PITR + isolated DR environment, vault credential/destination/WAL refs via S101, clear S107 storage/KMS deps, prove production restore (RPO 15m / RTO 4h), then human approval. Sandbox pg_dump/recovery-drill is not production backup or RTO proof.',
    force_launch_available: false,
    force_deploy_available: false,
    can_production_launch: 'NO',
    launch_control_overall: launch.overall_status,
    control_plane: 'S100_REUSED',
    foundation_plane: 'S101_REUSED',
    s96_plane: 'COMPOSED',
    s107_plane: 'DEPENDENCY',
    runtime_adapters: {
      backup: 'local_pg_dump_sandbox',
      pitr: 'not_selected',
      dr: 'sandbox_isolated_drill_only',
    },
    evaluated_at: new Date().toISOString(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    connection_strings_printed: false,
    fake_backup_provider_invented: false,
    fake_pitr_invented: false,
    fake_dr_failover_invented: false,
    fake_rpo_rto_proven: false,
    message:
      'Sprint 108 real backup/PITR/DR readiness: providers NOT_SELECTED / EXTERNAL_GATED. Sandbox pg_dump + isolated restore remain SANDBOX_ONLY. RPO 15m / RTO 4h = TARGET_DEFINED / NOT_YET_PROVEN. PRODUCTION LOCAL-DISK BACKUP FALLBACK = NO. PRODUCTION BACKUP/PITR/DR ENABLED = NO. CAN_PRODUCTION_LAUNCH = NO.',
  };
}

/**
 * Sprint 96 — Production managed backup / PITR / DR configuration validation.
 * Never invent managed DB vendors, WAL evidence, DR regions, or live credentials.
 * Never expose secrets — only reference_present / configured flags.
 */
import { readInfrastructureEnvironment } from './infra-environment';

export const BACKUP_PROVIDER_NOT_SELECTED = 'BACKUP_PROVIDER_NOT_SELECTED';
export const BACKUP_CREDENTIAL_REFERENCE_MISSING = 'BACKUP_CREDENTIAL_REFERENCE_MISSING';
export const BACKUP_DESTINATION_REFERENCE_MISSING = 'BACKUP_DESTINATION_REFERENCE_MISSING';
export const BACKUP_SCHEDULE_CONFIGURATION_REQUIRED = 'BACKUP_SCHEDULE_CONFIGURATION_REQUIRED';
export const BACKUP_RETENTION_POLICY_CONFIGURATION_REQUIRED =
  'BACKUP_RETENTION_POLICY_CONFIGURATION_REQUIRED';
export const PITR_PROVIDER_NOT_SELECTED = 'PITR_PROVIDER_NOT_SELECTED';
export const PITR_WAL_RETENTION_CONFIGURATION_REQUIRED = 'PITR_WAL_RETENTION_CONFIGURATION_REQUIRED';
export const PITR_RESTORE_ENVIRONMENT_REFERENCE_MISSING =
  'PITR_RESTORE_ENVIRONMENT_REFERENCE_MISSING';
export const DR_ENVIRONMENT_NOT_SELECTED = 'DR_ENVIRONMENT_NOT_SELECTED';
export const DR_REGION_REFERENCE_MISSING = 'DR_REGION_REFERENCE_MISSING';
export const DR_OBJECT_STORAGE_DEPENDENCY_GATED = 'DR_OBJECT_STORAGE_DEPENDENCY_GATED';
export const DR_KMS_DEPENDENCY_GATED = 'DR_KMS_DEPENDENCY_GATED';
export const DR_MONITORING_DEPENDENCY_GATED = 'DR_MONITORING_DEPENDENCY_GATED';
export const RPO_RTO_NOT_YET_PROVEN = 'RPO_RTO_NOT_YET_PROVEN';

export type BackupConfigPresence = {
  key: string;
  reference_present: boolean;
  configured: boolean;
};

export type BackupTriadConfigurationReadiness = {
  managed_backup: {
    provider: 'NOT_SELECTED' | string;
    configuration: 'READY' | 'MISSING';
    credentials: 'READY' | 'MISSING';
    destination: 'READY' | 'MISSING';
    schedule: 'READY' | 'MISSING' | 'EXTERNAL_GATED';
    retention: 'POLICY_REQUIRED' | 'READY';
    encryption_dependency: 'EXTERNAL_GATED' | 'READY';
    production_activation: 'EXTERNAL_GATED' | 'READY';
  };
  pitr: {
    provider: 'NOT_SELECTED' | string;
    configuration: 'READY' | 'MISSING';
    wal_retention: 'EXTERNAL_GATED' | 'READY';
    restore_environment: 'READY' | 'MISSING' | 'EXTERNAL_GATED';
    production_activation: 'EXTERNAL_GATED' | 'READY';
  };
  dr_environment: {
    provider: 'NOT_SELECTED' | string;
    configuration: 'READY' | 'MISSING';
    region: 'READY' | 'MISSING' | 'EXTERNAL_GATED';
    database_recovery: 'SANDBOX_ONLY' | 'READY' | 'EXTERNAL_GATED';
    object_storage_dependency: 'EXTERNAL_GATED' | 'READY';
    kms_dependency: 'EXTERNAL_GATED' | 'READY';
    monitoring_dependency: 'EXTERNAL_GATED' | 'READY';
    production_activation: 'EXTERNAL_GATED' | 'READY';
  };
  environment: 'SANDBOX' | 'PRODUCTION';
};

export type ProductionBackupConfigurationValidation = {
  environment: 'sandbox' | 'production';
  pitr_live_enabled: boolean;
  backup_provider_selected: boolean;
  pitr_provider_selected: boolean;
  dr_environment_selected: boolean;
  credential_reference: BackupConfigPresence;
  destination_reference: BackupConfigPresence;
  schedule_reference: BackupConfigPresence;
  wal_retention_reference: BackupConfigPresence;
  restore_environment_reference: BackupConfigPresence;
  dr_region_reference: BackupConfigPresence;
  blockers: string[];
  ready_for_activation: false;
  secrets_exposed: false;
  connection_strings_exposed: false;
  configuration_readiness: BackupTriadConfigurationReadiness;
  eligibility: {
    pg_dump_equals_managed_backup: false;
    pg_dump_equals_pitr: false;
    sandbox_drill_equals_production_rto: false;
    database_recovery_equals_object_storage_recovery: false;
    migration_history_equals_backup: false;
  };
  message: string;
};

function refPresent(envKey: string): boolean {
  const v = process.env[envKey]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function presence(key: string): BackupConfigPresence {
  const present = refPresent(key);
  return { key, reference_present: present, configured: present };
}

export function validateProductionBackupConfiguration(input?: {
  backupSelected?: boolean;
  pitrSelected?: boolean;
  drSelected?: boolean;
}): ProductionBackupConfigurationValidation {
  const infraEnv = readInfrastructureEnvironment();
  const backupSelected = Boolean(input?.backupSelected);
  const pitrSelected = Boolean(input?.pitrSelected);
  const drSelected = Boolean(input?.drSelected);
  const pitrLive =
    process.env['PITR_LIVE_ENABLED']?.trim().toLowerCase() === 'true';

  const credential_reference = presence('MANAGED_BACKUP_SECRET_REF');
  const destination_reference = presence('MANAGED_BACKUP_DESTINATION_REF');
  const schedule_reference = presence('MANAGED_BACKUP_SCHEDULE_REF');
  const wal_retention_reference = presence('PITR_WAL_RETENTION_REF');
  const restore_environment_reference = presence('PITR_RESTORE_ENVIRONMENT_REF');
  const dr_region_reference = presence('DR_ENVIRONMENT_REGION_REF');

  const blockers: string[] = [];
  if (!backupSelected) blockers.push(BACKUP_PROVIDER_NOT_SELECTED);
  if (!credential_reference.reference_present) blockers.push(BACKUP_CREDENTIAL_REFERENCE_MISSING);
  if (!destination_reference.reference_present) {
    blockers.push(BACKUP_DESTINATION_REFERENCE_MISSING);
  }
  if (!schedule_reference.reference_present) {
    blockers.push(BACKUP_SCHEDULE_CONFIGURATION_REQUIRED);
  }
  blockers.push(BACKUP_RETENTION_POLICY_CONFIGURATION_REQUIRED);
  if (!pitrSelected) blockers.push(PITR_PROVIDER_NOT_SELECTED);
  if (!wal_retention_reference.reference_present) {
    blockers.push(PITR_WAL_RETENTION_CONFIGURATION_REQUIRED);
  }
  if (!restore_environment_reference.reference_present) {
    blockers.push(PITR_RESTORE_ENVIRONMENT_REFERENCE_MISSING);
  }
  if (!drSelected) blockers.push(DR_ENVIRONMENT_NOT_SELECTED);
  if (!dr_region_reference.reference_present) blockers.push(DR_REGION_REFERENCE_MISSING);
  blockers.push(DR_OBJECT_STORAGE_DEPENDENCY_GATED);
  blockers.push(DR_KMS_DEPENDENCY_GATED);
  blockers.push(DR_MONITORING_DEPENDENCY_GATED);
  blockers.push(RPO_RTO_NOT_YET_PROVEN);

  const missing = (ok: boolean) => (ok ? ('READY' as const) : ('MISSING' as const));

  const configuration_readiness: BackupTriadConfigurationReadiness = {
    managed_backup: {
      provider: backupSelected ? 'SELECTED' : 'NOT_SELECTED',
      configuration: missing(
        backupSelected &&
          credential_reference.reference_present &&
          destination_reference.reference_present,
      ),
      credentials: missing(credential_reference.reference_present),
      destination: missing(destination_reference.reference_present),
      schedule: schedule_reference.reference_present ? 'READY' : 'EXTERNAL_GATED',
      retention: 'POLICY_REQUIRED',
      encryption_dependency: 'EXTERNAL_GATED',
      production_activation: 'EXTERNAL_GATED',
    },
    pitr: {
      provider: pitrSelected ? 'SELECTED' : 'NOT_SELECTED',
      configuration: missing(pitrSelected && wal_retention_reference.reference_present),
      wal_retention: 'EXTERNAL_GATED',
      restore_environment: restore_environment_reference.reference_present
        ? 'READY'
        : 'EXTERNAL_GATED',
      production_activation: 'EXTERNAL_GATED',
    },
    dr_environment: {
      provider: drSelected ? 'SELECTED' : 'NOT_SELECTED',
      configuration: missing(drSelected && dr_region_reference.reference_present),
      region: 'EXTERNAL_GATED',
      database_recovery: 'SANDBOX_ONLY',
      object_storage_dependency: 'EXTERNAL_GATED',
      kms_dependency: 'EXTERNAL_GATED',
      monitoring_dependency: 'EXTERNAL_GATED',
      production_activation: 'EXTERNAL_GATED',
    },
    environment: infraEnv === 'production' ? 'PRODUCTION' : 'SANDBOX',
  };

  return {
    environment: infraEnv,
    pitr_live_enabled: pitrLive,
    backup_provider_selected: backupSelected,
    pitr_provider_selected: pitrSelected,
    dr_environment_selected: drSelected,
    credential_reference,
    destination_reference,
    schedule_reference,
    wal_retention_reference,
    restore_environment_reference,
    dr_region_reference,
    blockers,
    ready_for_activation: false,
    secrets_exposed: false,
    connection_strings_exposed: false,
    configuration_readiness,
    eligibility: {
      pg_dump_equals_managed_backup: false,
      pg_dump_equals_pitr: false,
      sandbox_drill_equals_production_rto: false,
      database_recovery_equals_object_storage_recovery: false,
      migration_history_equals_backup: false,
    },
    message:
      'Managed backup / PITR / DR NOT_SELECTED — production vault references missing. Local pg_dump + isolated recovery-drill are not production managed PITR.',
  };
}

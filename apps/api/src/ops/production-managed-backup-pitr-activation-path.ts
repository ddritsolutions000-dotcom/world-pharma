/**
 * Sprint 147 — Production managed backup + PITR activation control (software).
 * Composes S74/S83/S96/S108 (+ S141 verification) with S142–S146 (+ S140 storage).
 * Does NOT rebuild S141 or invent a second backup system / cloud provider / fake snapshots.
 * Lifecycle: NOT_SELECTED → CONFIGURED → VERIFIED → APPROVED → ENABLED
 * SOFTWARE_COMPLETE ≠ ENABLED. RPO 15m / RTO 4h = TARGET_DEFINED / NOT_YET_PROVEN.
 */
import { Errors } from '../common/problem';
import { assertNoSecretLeak } from './secret-redaction';
import { readInfrastructureEnvironment, type InfraRuntimeEnvironment } from './infra-environment';
import { getRecoveryObjectives } from './recovery-targets';
import {
  evaluateRealBackupFirstOnboarding,
  NO_PRODUCTION_MANAGED_BACKUP_PITR,
  NO_PRODUCTION_MANAGED_BACKUP,
  NO_PRODUCTION_PITR,
  NO_PRODUCTION_DR_ENVIRONMENT,
  BACKUP_PROVIDER_NOT_SELECTED,
  BACKUP_CREDENTIAL_REFERENCE_MISSING,
  PITR_PROVIDER_NOT_SELECTED,
  RPO_RTO_NOT_YET_PROVEN,
  DR_ENVIRONMENT_NOT_SELECTED,
} from './backup-real-activation-first-onboarding';
import type { BackupActivationLifecycle } from './production-backup-first-onboarding';
import {
  secretsManagerRuntimeResolverStatus,
  presentSecretReference,
  type SecretReference,
} from './secrets-manager-runtime-resolver';
import { evaluateObservabilityApmMonitoringAlertingProductionActivationPath } from './observability-apm-monitoring-alerting-production-activation-path';
import {
  assertReleaseCallerAuthorized,
  buildSafeReleaseEvent,
  emitSafeReleaseObservabilityEvent,
  type ReleaseCaller,
} from './deployment-release-engineering-production-activation-path';
import { evaluateProductionDeploymentTargetActivationPath } from './production-deployment-target-activation-path';
import {
  evaluateProductionDatabaseActivationPath,
  assertProductionDatabaseTargetSafe,
  NO_PRODUCTION_DATABASE,
  LOCALHOST_DATABASE_BLOCKED_IN_PRODUCTION,
  SANDBOX_DATABASE_BLOCKED_IN_PRODUCTION,
} from './production-database-activation-path';
import { evaluatePrivateStorageKmsMalwareProductionActivationPath } from './private-storage-kms-malware-production-activation-path';
import { NO_PRODUCTION_PRIVATE_STORAGE } from './production-storage-first-onboarding';
import {
  NO_PRODUCTION_SECRETS_MANAGER,
  NO_PRODUCTION_ENVIRONMENT,
} from './production-foundation-activation-preparation';

export const PRODUCTION_MANAGED_BACKUP_PITR_ACTIVATION_PATH_AUTHORITATIVE =
  'PRODUCTION_MANAGED_BACKUP_PITR_ACTIVATION_PATH_AUTHORITATIVE';

export const NO_PRODUCTION_BACKUP_ADAPTER = 'NO_PRODUCTION_BACKUP_ADAPTER';
export const PRODUCTION_BACKUP_DB_BINDING_REJECTED =
  'PRODUCTION_BACKUP_DB_BINDING_REJECTED';
export const LOCAL_BACKUP_NEQ_PRODUCTION = 'LOCAL_BACKUP_NEQ_PRODUCTION';
export const SANDBOX_RESTORE_NEQ_PRODUCTION = 'SANDBOX_RESTORE_NEQ_PRODUCTION';
export const FORGED_BACKUP_STATE_REJECTED = 'FORGED_BACKUP_STATE_REJECTED';
export const FORGED_RECOVERY_POINT_REJECTED = 'FORGED_RECOVERY_POINT_REJECTED';
export const FORGED_DB_BINDING_REJECTED = 'FORGED_DB_BINDING_REJECTED';
export const CLIENT_RESTORE_ACCESS_DENIED = 'CLIENT_RESTORE_ACCESS_DENIED';
export const PRODUCTION_BACKUP_ACTIVATION_BLOCKED =
  'PRODUCTION_BACKUP_ACTIVATION_BLOCKED';
export const PRODUCTION_RESTORE_EXTERNAL_GATED = 'PRODUCTION_RESTORE_EXTERNAL_GATED';
export const PRODUCTION_PITR_EXTERNAL_GATED = 'PRODUCTION_PITR_EXTERNAL_GATED';
export const MOCK_BACKUP_ADAPTER_BLOCKED = 'MOCK_BACKUP_ADAPTER_BLOCKED';

export {
  NO_PRODUCTION_MANAGED_BACKUP_PITR,
  NO_PRODUCTION_MANAGED_BACKUP,
  NO_PRODUCTION_PITR,
  NO_PRODUCTION_DR_ENVIRONMENT,
  RPO_RTO_NOT_YET_PROVEN,
  LOCALHOST_DATABASE_BLOCKED_IN_PRODUCTION,
  SANDBOX_DATABASE_BLOCKED_IN_PRODUCTION,
};

function envPresent(key: string): boolean {
  const v = process.env[key]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function envValue(key: string): string | null {
  const v = process.env[key]?.trim();
  if (!v || /^changeme|todo|placeholder|xxx$/i.test(v)) return null;
  return v;
}

export type ManagedBackupSlotPresence = {
  id: string;
  label: string;
  env_key: string;
  reference_present: boolean;
  required_for_production: boolean;
  secret: boolean;
};

export function buildLiveManagedBackupSlots(): ManagedBackupSlotPresence[] {
  const slot = (
    id: string,
    label: string,
    env_key: string,
    required: boolean,
    secret: boolean,
  ): ManagedBackupSlotPresence => ({
    id,
    label,
    env_key,
    reference_present: envPresent(env_key),
    required_for_production: required,
    secret,
  });
  return [
    slot('backup_provider', 'Managed backup provider', 'MANAGED_BACKUP_PROVIDER', true, false),
    slot('pitr_provider', 'PITR provider', 'PITR_PROVIDER', true, false),
    slot('credential_ref', 'Backup credential secret reference', 'BACKUP_CREDENTIAL_SECRET_REF', true, true),
    slot('destination_ref', 'Backup destination reference', 'BACKUP_DESTINATION_REF', true, false),
    slot('schedule_ref', 'Backup schedule', 'BACKUP_SCHEDULE_REF', true, false),
    slot('retention_ref', 'Retention policy', 'BACKUP_RETENTION_REF', true, false),
    slot('encryption_ref', 'Encryption / KMS reference', 'BACKUP_ENCRYPTION_REF', true, true),
    slot('db_binding_ref', 'Production DB binding', 'PRODUCTION_DATABASE_IDENTITY_REF', true, false),
    slot('dr_environment_ref', 'DR environment', 'DR_ENVIRONMENT_REF', true, false),
    slot('observability_ref', 'Observability reference', 'OBSERVABILITY_REF', true, false),
  ];
}

export function isSandboxOrMockBackupProvider(code: string | null | undefined): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  return (
    upper === 'LOCAL' ||
    upper === 'LOCALHOST' ||
    upper === 'SANDBOX' ||
    upper === 'MOCK' ||
    upper === 'PG_DUMP' ||
    upper === 'NULL' ||
    upper === 'DEV' ||
    upper === 'TEST' ||
    upper.startsWith('MOCK_') ||
    upper.startsWith('SANDBOX_')
  );
}

export function readConfiguredManagedBackupProvider(): {
  selected: boolean;
  code: string | null;
  mock_rejected: boolean;
} {
  const raw = envValue('MANAGED_BACKUP_PROVIDER') ?? envValue('BACKUP_PROVIDER');
  if (!raw) return { selected: false, code: null, mock_rejected: false };
  const code = raw.toUpperCase();
  if (isSandboxOrMockBackupProvider(code)) {
    return { selected: false, code, mock_rejected: true };
  }
  return { selected: true, code, mock_rejected: false };
}

/** Bind backup/PITR only to verified production DB identity (S146). */
export function evaluateProductionDatabaseBinding(): {
  bound: false;
  identity_ref: string | null;
  s146_lifecycle: string;
  s146_enabled: boolean;
  acceptable: false;
  blocker: typeof NO_PRODUCTION_DATABASE | typeof PRODUCTION_BACKUP_DB_BINDING_REJECTED;
} {
  const s146 = evaluateProductionDatabaseActivationPath();
  const identity_ref =
    envValue('PRODUCTION_DATABASE_IDENTITY_REF') ??
    envValue('PRODUCTION_DATABASE_TARGET_REF');
  if (identity_ref) {
    try {
      assertProductionDatabaseTargetSafe(identity_ref);
    } catch {
      return {
        bound: false,
        identity_ref,
        s146_lifecycle: s146.lifecycle,
        s146_enabled: s146.enabled,
        acceptable: false,
        blocker: PRODUCTION_BACKUP_DB_BINDING_REJECTED,
      };
    }
  }
  return {
    bound: false,
    identity_ref,
    s146_lifecycle: s146.lifecycle,
    s146_enabled: s146.enabled,
    acceptable: false,
    blocker: NO_PRODUCTION_DATABASE,
  };
}

export abstract class ManagedBackupProviderAdapter {
  abstract readonly name: string;
  abstract configure(): Promise<void>;
  abstract validate(): Promise<void>;
  abstract verify(): Promise<{ verified: false }>;
  abstract createBackup(): Promise<{ backup_id: null }>;
  abstract listBackups(): Promise<{ backups: [] }>;
  abstract verifyBackup(_id: string): Promise<{ verified: false }>;
  abstract createRecoveryPoint(): Promise<{ recovery_point_id: null }>;
  abstract validateRecoveryPoint(_id: string): Promise<{ valid: false }>;
  abstract initiateRestore(_input: {
    recovery_point_ref: string;
    target_ref: string;
  }): Promise<{ restore_id: null }>;
  abstract verifyRestore(_id: string): Promise<{ verified: false }>;
  abstract recordEvidence(_input: { event: string }): Promise<void>;
}

export class FailClosedProductionBackupAdapter extends ManagedBackupProviderAdapter {
  readonly name = 'fail_closed_production_backup';

  private blocked(op: string): never {
    throw Errors.problem(
      503,
      PRODUCTION_BACKUP_ACTIVATION_BLOCKED,
      'Production backup adapter blocked',
      `${NO_PRODUCTION_BACKUP_ADAPTER}: ${op} unavailable. No fake backup/PITR success. Live provider EXTERNAL_GATED.`,
    );
  }

  async configure(): Promise<void> {
    this.blocked('configure');
  }
  async validate(): Promise<void> {
    this.blocked('validate');
  }
  async verify(): Promise<{ verified: false }> {
    this.blocked('verify');
  }
  async createBackup(): Promise<{ backup_id: null }> {
    this.blocked('createBackup');
  }
  async listBackups(): Promise<{ backups: [] }> {
    this.blocked('listBackups');
  }
  async verifyBackup(): Promise<{ verified: false }> {
    this.blocked('verifyBackup');
  }
  async createRecoveryPoint(): Promise<{ recovery_point_id: null }> {
    this.blocked('createRecoveryPoint');
  }
  async validateRecoveryPoint(): Promise<{ valid: false }> {
    this.blocked('validateRecoveryPoint');
  }
  async initiateRestore(): Promise<{ restore_id: null }> {
    this.blocked('initiateRestore');
  }
  async verifyRestore(): Promise<{ verified: false }> {
    this.blocked('verifyRestore');
  }
  async recordEvidence(): Promise<void> {
    this.blocked('recordEvidence');
  }
}

let registeredProductionBackupAdapter: ManagedBackupProviderAdapter | null = null;

export function registerProductionBackupAdapter(
  adapter: ManagedBackupProviderAdapter | null,
): void {
  registeredProductionBackupAdapter = adapter;
}

export function getRegisteredProductionBackupAdapter(): ManagedBackupProviderAdapter | null {
  return registeredProductionBackupAdapter;
}

export function selectManagedBackupProviderAdapter(): ManagedBackupProviderAdapter {
  return registeredProductionBackupAdapter ?? new FailClosedProductionBackupAdapter();
}

export type BackupVerificationCheck = {
  id: string;
  ok: boolean;
  blocker: string | null;
};

export function evaluateManagedBackupVerificationChecks(): {
  checks: BackupVerificationCheck[];
  blockers: string[];
} {
  const slots = buildLiveManagedBackupSlots();
  const provider = readConfiguredManagedBackupProvider();
  const checks: BackupVerificationCheck[] = [
    {
      id: 'managed_backup_configured',
      ok: false,
      blocker: NO_PRODUCTION_MANAGED_BACKUP,
    },
    {
      id: 'backup_schedule',
      ok: slots.find((s) => s.id === 'schedule_ref')?.reference_present === true,
      blocker: 'BACKUP_SCHEDULE_CONFIGURATION_REQUIRED',
    },
    {
      id: 'retention_policy',
      ok: slots.find((s) => s.id === 'retention_ref')?.reference_present === true,
      blocker: 'BACKUP_RETENTION_POLICY_CONFIGURATION_REQUIRED',
    },
    {
      id: 'encryption',
      ok: slots.find((s) => s.id === 'encryption_ref')?.reference_present === true,
      blocker: 'BACKUP_ENCRYPTION_DEPENDENCY_GATED',
    },
    {
      id: 'production_db_bound',
      ok: false,
      blocker: NO_PRODUCTION_DATABASE,
    },
    {
      id: 'recovery_points_available',
      ok: false,
      blocker: NO_PRODUCTION_PITR,
    },
    {
      id: 'recovery_point_integrity',
      ok: false,
      blocker: PRODUCTION_PITR_EXTERNAL_GATED,
    },
    {
      id: 'monitoring_alerting',
      ok: false,
      blocker: 'DR_MONITORING_DEPENDENCY_GATED',
    },
    {
      id: 'backup_failure_alert',
      ok: false,
      blocker: 'DR_MONITORING_DEPENDENCY_GATED',
    },
    {
      id: 'restore_environment',
      ok: false,
      blocker: NO_PRODUCTION_DR_ENVIRONMENT,
    },
    {
      id: 'provider_selected',
      ok: provider.selected && !provider.mock_rejected,
      blocker: provider.mock_rejected
        ? MOCK_BACKUP_ADAPTER_BLOCKED
        : BACKUP_PROVIDER_NOT_SELECTED,
    },
    {
      id: 'adapter_registered',
      ok: registeredProductionBackupAdapter != null,
      blocker: NO_PRODUCTION_BACKUP_ADAPTER,
    },
  ];
  return {
    checks,
    blockers: [...new Set(checks.filter((c) => !c.ok).map((c) => c.blocker!).filter(Boolean))],
  };
}

export function evaluatePitrVerificationContract() {
  return {
    pitr_capability_configured: false,
    wal_retention_configured: false,
    recovery_window_configured: false,
    recovery_point_selection_validated: false,
    restore_target_isolated: true,
    restore_authorization_required: true,
    restore_verification_required: true,
    production_status: 'EXTERNAL_GATED' as const,
    blocker: NO_PRODUCTION_PITR,
    remaining: PRODUCTION_PITR_EXTERNAL_GATED,
  };
}

export function evaluateRestoreSafetyContract() {
  return {
    s141_rebuilt: false,
    requires_explicit_authorization: true,
    requires_correct_production_environment: true,
    requires_valid_recovery_point: true,
    requires_isolated_or_approved_target: true,
    requires_audit_event: true,
    requires_observability_event: true,
    client_browser_restore_forbidden: true,
    production_restore_proven: false,
    sandbox_restore_neq_production: true,
    blocker: PRODUCTION_RESTORE_EXTERNAL_GATED,
  };
}

export function evaluateDrEnvironmentContract() {
  return {
    dr_target: null as string | null,
    environment: readInfrastructureEnvironment(),
    database_target: null as string | null,
    storage_target: null as string | null,
    secrets_reference: envValue('BACKUP_CREDENTIAL_SECRET_REF'),
    deployment_reference: envValue('DEPLOYMENT_TARGET_REF'),
    observability_reference: envValue('OBSERVABILITY_REF'),
    recovery_procedure: 'SOFTWARE_CONTRACT' as const,
    verification_evidence: 'MISSING' as const,
    configured: false,
    enabled: false,
    remaining_blocker: NO_PRODUCTION_DR_ENVIRONMENT,
    production_status: 'EXTERNAL_GATED' as const,
  };
}

export function presentManagedBackupSecretReferences(): ReturnType<
  typeof presentSecretReference
>[] {
  const refs: SecretReference[] = [
    {
      ref_id: envValue('BACKUP_CREDENTIAL_SECRET_REF') ?? '',
      purpose: 'backup_credentials',
      environment:
        readInfrastructureEnvironment() === 'production' ? 'production' : 'sandbox',
      provider_service: 'managed_backup',
    },
    {
      ref_id: envValue('BACKUP_ENCRYPTION_REF') ?? '',
      purpose: 'backup_encryption',
      environment:
        readInfrastructureEnvironment() === 'production' ? 'production' : 'sandbox',
      provider_service: 'kms',
    },
  ];
  return refs.filter((r) => r.ref_id.trim().length > 0).map(presentSecretReference);
}

export function listCriticalBackupAlertContracts(): Array<{
  id: string;
  severity: 'critical';
  production_pager: 'EXTERNAL_GATED';
}> {
  return [
    { id: 'backup_failure', severity: 'critical', production_pager: 'EXTERNAL_GATED' },
    { id: 'recovery_point_failure', severity: 'critical', production_pager: 'EXTERNAL_GATED' },
    { id: 'pitr_unavailable', severity: 'critical', production_pager: 'EXTERNAL_GATED' },
    { id: 'restore_failure', severity: 'critical', production_pager: 'EXTERNAL_GATED' },
    { id: 'dr_verification_failure', severity: 'critical', production_pager: 'EXTERNAL_GATED' },
  ];
}

export function deriveManagedBackupLifecycle(): {
  lifecycle: BackupActivationLifecycle;
  configured: boolean;
  verified: false;
  approved: false;
  enabled: false;
} {
  const provider = readConfiguredManagedBackupProvider();
  const slots = buildLiveManagedBackupSlots();
  const requiredPresent = slots
    .filter((s) => s.required_for_production)
    .every((s) => s.reference_present);
  return {
    lifecycle: 'NOT_SELECTED',
    configured: provider.selected && requiredPresent,
    verified: false,
    approved: false,
    enabled: false,
  };
}

export function assertProductionBackupActivationAllowed(
  context: string,
  caller: ReleaseCaller,
): void {
  assertReleaseCallerAuthorized(caller);
  if (readInfrastructureEnvironment() !== 'production') return;
  const provider = readConfiguredManagedBackupProvider();
  if (provider.mock_rejected) {
    throw Errors.problem(
      503,
      MOCK_BACKUP_ADAPTER_BLOCKED,
      'Mock backup provider blocked',
      `${context}: sandbox/mock/local backup providers cannot activate production.`,
    );
  }
  throw Errors.problem(
    503,
    PRODUCTION_BACKUP_ACTIVATION_BLOCKED,
    'Production backup activation blocked',
    `${context}: ${NO_PRODUCTION_MANAGED_BACKUP_PITR}. Software COMPLETE; live provider EXTERNAL_GATED.`,
  );
}

export function assertProductionRestoreAuthorized(
  context: string,
  caller: ReleaseCaller,
): void {
  assertReleaseCallerAuthorized(caller);
  if (caller.kind === 'client_browser') {
    throw Errors.problem(
      403,
      CLIENT_RESTORE_ACCESS_DENIED,
      'Client restore access denied',
      'Browser/mobile callers cannot trigger privileged production restore.',
    );
  }
  throw Errors.problem(
    503,
    PRODUCTION_RESTORE_EXTERNAL_GATED,
    'Production restore not authorized',
    `${context}: ${NO_PRODUCTION_DR_ENVIRONMENT}. Sandbox restore ≠ production proof.`,
  );
}

export function rejectForgedBackupState(claimed: {
  lifecycle?: string;
  enabled?: boolean;
}): never {
  throw Errors.problem(
    403,
    FORGED_BACKUP_STATE_REJECTED,
    'Forged backup state rejected',
    `Client/forged backup claims ignored (lifecycle=${claimed.lifecycle ?? 'n/a'}, enabled=${String(claimed.enabled)}).`,
  );
}

export function rejectForgedRecoveryPoint(claimed: {
  recovery_point_id?: string;
  verified?: boolean;
}): never {
  throw Errors.problem(
    403,
    FORGED_RECOVERY_POINT_REJECTED,
    'Forged recovery point rejected',
    `Client/forged recovery point ignored (id=${claimed.recovery_point_id ?? 'n/a'}).`,
  );
}

export function rejectForgedDbBinding(claimed: {
  identity_ref?: string;
  bound?: boolean;
}): never {
  throw Errors.problem(
    403,
    FORGED_DB_BINDING_REJECTED,
    'Forged production DB binding rejected',
    `Client/forged DB binding ignored (ref=${claimed.identity_ref ?? 'n/a'}, bound=${String(claimed.bound)}).`,
  );
}

export type ProductionManagedBackupPitrActivationPathReport = {
  sprint: 147;
  authoritative_source: typeof PRODUCTION_MANAGED_BACKUP_PITR_ACTIVATION_PATH_AUTHORITATIVE;
  s141_rebuilt: false;
  parallel_backup_system_created: false;
  fake_infrastructure_invented: false;
  fake_credentials_invented: false;
  fake_snapshots_invented: false;
  fake_pitr_claimed: false;
  secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
  infrastructure_environment: InfraRuntimeEnvironment;
  environment_isolation: {
    development_neq_sandbox: true;
    sandbox_neq_staging: true;
    staging_neq_production: true;
    local_backup_neq_production: true;
    sandbox_restore_neq_production: true;
  };
  software_activation_path: 'COMPLETE';
  composed_foundations: {
    s74_s83_s96_s108: 'COMPOSED';
    s141: 'REUSED_NOT_REBUILT';
    s140: 'COMPOSED';
    s142: 'COMPOSED';
    s143: 'COMPOSED';
    s144: 'COMPOSED';
    s145: 'COMPOSED';
    s146: 'COMPOSED';
  };
  lifecycle: BackupActivationLifecycle;
  configured: boolean;
  verified: false;
  approved: false;
  enabled: false;
  provider: {
    selected: boolean;
    code: string | null;
    mock_rejected: boolean;
    state: 'EXTERNAL_GATED' | 'NOT_SELECTED';
  };
  adapter: {
    production_registered: boolean;
    selected: string;
  };
  database_binding: ReturnType<typeof evaluateProductionDatabaseBinding>;
  configuration_slots: ManagedBackupSlotPresence[];
  secret_references_presence: ReturnType<typeof presentManagedBackupSecretReferences>;
  verification_checks: ReturnType<typeof evaluateManagedBackupVerificationChecks>;
  pitr: ReturnType<typeof evaluatePitrVerificationContract>;
  restore_safety: ReturnType<typeof evaluateRestoreSafetyContract>;
  dr_environment: ReturnType<typeof evaluateDrEnvironmentContract>;
  rpo_rto: {
    rpo_target: '15m';
    rto_target: '4h';
    status: 'TARGET_DEFINED';
    rpo_achievement: 'NOT_YET_PROVEN';
    rto_achievement: 'NOT_YET_PROVEN';
    blocker: typeof RPO_RTO_NOT_YET_PROVEN;
  };
  critical_alerts: ReturnType<typeof listCriticalBackupAlertContracts>;
  dependency_blockers: {
    s146_database: typeof NO_PRODUCTION_DATABASE;
    s142_secrets: typeof NO_PRODUCTION_SECRETS_MANAGER;
    s140_storage: string;
    s145_deployment: string;
    s143_observability: string;
    dr: typeof NO_PRODUCTION_DR_ENVIRONMENT;
  };
  deployment_gate: {
    production_deployable: false;
    loosened_for_green_status: false;
    backup_blocker: typeof NO_PRODUCTION_MANAGED_BACKUP_PITR;
    s145_deployable: boolean;
  };
  s108_snapshot: {
    remaining_blocker: string;
    production_backup_enabled: boolean;
    production_pitr_enabled: boolean;
  };
  s142_snapshot: { secrets_manager_runtime_resolver: string };
  s143_snapshot: {
    software_activation_path: string;
    production_observability_enabled: boolean;
  };
  s145_snapshot: { deployable: boolean; deployed: boolean };
  s146_snapshot: { lifecycle: string; enabled: boolean };
  release_event_sample: ReturnType<typeof buildSafeReleaseEvent>;
  blockers: string[];
  remaining_blocker: typeof NO_PRODUCTION_MANAGED_BACKUP_PITR;
  can_production_launch: 'NO';
  secrets_printed: false;
  phi_printed: false;
  admin_summary: {
    production_backup_pitr: 'NOT_SELECTED' | 'EXTERNAL_GATED';
    software_state: 'SOFTWARE_COMPLETE';
    provider: string;
    database_binding: string;
    configuration: 'MISSING' | 'PARTIAL' | 'PRESENT';
    verification: 'UNVERIFIED' | 'EXTERNAL_GATED';
    approval: 'NOT_APPROVED';
    enabled: false;
    rpo: '15m TARGET_DEFINED / NOT_YET_PROVEN';
    rto: '4h TARGET_DEFINED / NOT_YET_PROVEN';
    dr_environment: typeof NO_PRODUCTION_DR_ENVIRONMENT;
    restore_readiness: 'EXTERNAL_GATED';
    blocker_reason: string;
    external_gated: true;
  };
  message: string;
  correlation_id?: string;
  evaluated_at: string;
};

export function evaluateProductionManagedBackupPitrActivationPath(input?: {
  correlation_id?: string;
}): ProductionManagedBackupPitrActivationPathReport {
  const env = readInfrastructureEnvironment();
  const s108 = evaluateRealBackupFirstOnboarding();
  const s145 = evaluateProductionDeploymentTargetActivationPath();
  const s146 = evaluateProductionDatabaseActivationPath();
  const s143 = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
  const s140 = evaluatePrivateStorageKmsMalwareProductionActivationPath();
  const recovery = getRecoveryObjectives();
  const provider = readConfiguredManagedBackupProvider();
  const derived = deriveManagedBackupLifecycle();
  const database_binding = evaluateProductionDatabaseBinding();
  const verification = evaluateManagedBackupVerificationChecks();
  const slots = buildLiveManagedBackupSlots();
  const pitr = evaluatePitrVerificationContract();
  const restore_safety = evaluateRestoreSafetyContract();
  const dr_environment = evaluateDrEnvironmentContract();

  const release_event_sample = buildSafeReleaseEvent({
    event_type: 'release_gate',
    deployment_state: 'NOT_CONFIGURED',
    correlation_id: input?.correlation_id,
  });
  void emitSafeReleaseObservabilityEvent(release_event_sample);

  const requiredCount = slots.filter((s) => s.required_for_production).length;
  const presentRequired = slots.filter(
    (s) => s.required_for_production && s.reference_present,
  ).length;
  const configuration: 'MISSING' | 'PARTIAL' | 'PRESENT' =
    presentRequired === 0 ? 'MISSING' : presentRequired >= requiredCount ? 'PRESENT' : 'PARTIAL';

  const blockers = [
    NO_PRODUCTION_MANAGED_BACKUP_PITR,
    NO_PRODUCTION_MANAGED_BACKUP,
    NO_PRODUCTION_PITR,
    NO_PRODUCTION_DR_ENVIRONMENT,
    NO_PRODUCTION_BACKUP_ADAPTER,
    BACKUP_PROVIDER_NOT_SELECTED,
    BACKUP_CREDENTIAL_REFERENCE_MISSING,
    PITR_PROVIDER_NOT_SELECTED,
    DR_ENVIRONMENT_NOT_SELECTED,
    RPO_RTO_NOT_YET_PROVEN,
    NO_PRODUCTION_DATABASE,
    NO_PRODUCTION_SECRETS_MANAGER,
    NO_PRODUCTION_PRIVATE_STORAGE,
    NO_PRODUCTION_ENVIRONMENT,
    LOCAL_BACKUP_NEQ_PRODUCTION,
    SANDBOX_RESTORE_NEQ_PRODUCTION,
    PRODUCTION_RESTORE_EXTERNAL_GATED,
    PRODUCTION_PITR_EXTERNAL_GATED,
    ...verification.blockers,
  ];
  if (provider.mock_rejected) blockers.push(MOCK_BACKUP_ADAPTER_BLOCKED);

  return {
    sprint: 147,
    authoritative_source: PRODUCTION_MANAGED_BACKUP_PITR_ACTIVATION_PATH_AUTHORITATIVE,
    s141_rebuilt: false,
    parallel_backup_system_created: false,
    fake_infrastructure_invented: false,
    fake_credentials_invented: false,
    fake_snapshots_invented: false,
    fake_pitr_claimed: false,
    secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    infrastructure_environment: env,
    environment_isolation: {
      development_neq_sandbox: true,
      sandbox_neq_staging: true,
      staging_neq_production: true,
      local_backup_neq_production: true,
      sandbox_restore_neq_production: true,
    },
    software_activation_path: 'COMPLETE',
    composed_foundations: {
      s74_s83_s96_s108: 'COMPOSED',
      s141: 'REUSED_NOT_REBUILT',
      s140: 'COMPOSED',
      s142: 'COMPOSED',
      s143: 'COMPOSED',
      s144: 'COMPOSED',
      s145: 'COMPOSED',
      s146: 'COMPOSED',
    },
    lifecycle: derived.lifecycle,
    configured: derived.configured,
    verified: false,
    approved: false,
    enabled: false,
    provider: {
      selected: provider.selected,
      code: provider.code,
      mock_rejected: provider.mock_rejected,
      state: provider.selected ? 'EXTERNAL_GATED' : 'NOT_SELECTED',
    },
    adapter: {
      production_registered: registeredProductionBackupAdapter != null,
      selected: selectManagedBackupProviderAdapter().name,
    },
    database_binding,
    configuration_slots: slots,
    secret_references_presence: presentManagedBackupSecretReferences(),
    verification_checks: verification,
    pitr,
    restore_safety,
    dr_environment,
    rpo_rto: {
      rpo_target: recovery.rpo_target,
      rto_target: recovery.rto_target,
      status: 'TARGET_DEFINED',
      rpo_achievement: 'NOT_YET_PROVEN',
      rto_achievement: 'NOT_YET_PROVEN',
      blocker: RPO_RTO_NOT_YET_PROVEN,
    },
    critical_alerts: listCriticalBackupAlertContracts(),
    dependency_blockers: {
      s146_database: NO_PRODUCTION_DATABASE,
      s142_secrets: NO_PRODUCTION_SECRETS_MANAGER,
      s140_storage: String(s140.remaining_blocker ?? NO_PRODUCTION_PRIVATE_STORAGE),
      s145_deployment: String(s145.remaining_blocker),
      s143_observability: s143.production_observability_enabled
        ? 'OK'
        : 'NO_PRODUCTION_APM_PROVIDER',
      dr: NO_PRODUCTION_DR_ENVIRONMENT,
    },
    deployment_gate: {
      production_deployable: false,
      loosened_for_green_status: false,
      backup_blocker: NO_PRODUCTION_MANAGED_BACKUP_PITR,
      s145_deployable: s145.deployable,
    },
    s108_snapshot: {
      remaining_blocker: String(s108.remaining_blocker),
      production_backup_enabled: s108.production_backup_enabled,
      production_pitr_enabled: s108.production_pitr_enabled,
    },
    s142_snapshot: {
      secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    },
    s143_snapshot: {
      software_activation_path: s143.software_activation_path,
      production_observability_enabled: s143.production_observability_enabled,
    },
    s145_snapshot: {
      deployable: s145.deployable,
      deployed: s145.deployed,
    },
    s146_snapshot: {
      lifecycle: s146.lifecycle,
      enabled: s146.enabled,
    },
    release_event_sample,
    blockers: [...new Set(blockers)],
    remaining_blocker: NO_PRODUCTION_MANAGED_BACKUP_PITR,
    can_production_launch: 'NO',
    secrets_printed: false,
    phi_printed: false,
    admin_summary: {
      production_backup_pitr: derived.configured ? 'EXTERNAL_GATED' : 'NOT_SELECTED',
      software_state: 'SOFTWARE_COMPLETE',
      provider: provider.selected ? (provider.code ?? 'NOT_SELECTED') : 'NOT_SELECTED',
      database_binding: database_binding.blocker,
      configuration,
      verification: 'UNVERIFIED',
      approval: 'NOT_APPROVED',
      enabled: false,
      rpo: '15m TARGET_DEFINED / NOT_YET_PROVEN',
      rto: '4h TARGET_DEFINED / NOT_YET_PROVEN',
      dr_environment: NO_PRODUCTION_DR_ENVIRONMENT,
      restore_readiness: 'EXTERNAL_GATED',
      blocker_reason: NO_PRODUCTION_MANAGED_BACKUP_PITR,
      external_gated: true,
    },
    message:
      'Software production managed backup/PITR activation control COMPLETE. Composes S108/S141 + S140 + S142–S146. Provider-neutral adapter fail-closed. RPO 15m / RTO 4h TARGET_DEFINED / NOT_YET_PROVEN. Local/sandbox backup ≠ production. SOFTWARE_COMPLETE ≠ ENABLED.',
    correlation_id: input?.correlation_id,
    evaluated_at: new Date().toISOString(),
  };
}

export function assertNoSecretLeakInBackupPayload(blob: string): boolean {
  return assertNoSecretLeak(blob);
}

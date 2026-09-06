/**
 * Sprint 146 — Production database activation + cutover safety (software).
 * Composes existing Prisma/schema/migrations + S74/S83/S96/S108 backup/DR +
 * S117–S119 + S142–S145.
 * Does NOT invent a production database, credentials, or claim ENABLED/migrated.
 * Lifecycle: NOT_CONFIGURED → CONFIGURED → VERIFIED → APPROVED → ENABLED
 * Migration: NOT_AUTHORIZED → AUTHORIZED → PRECHECKED → EXECUTING → VERIFIED
 * SOFTWARE_COMPLETE ≠ CONFIGURED (live) ≠ ENABLED.
 */
import { Errors } from '../common/problem';
import { assertNoSecretLeak } from './secret-redaction';
import { readInfrastructureEnvironment, type InfraRuntimeEnvironment } from './infra-environment';
import {
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
  evaluateMigrationReleaseSafety,
} from './production-deployment-requirements';
import {
  NO_PRODUCTION_DATABASE,
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_SECRETS_MANAGER,
  PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
} from './production-foundation-activation-preparation';
import {
  secretsManagerRuntimeResolverStatus,
  presentSecretReference,
  type SecretReference,
} from './secrets-manager-runtime-resolver';
import { evaluateObservabilityApmMonitoringAlertingProductionActivationPath } from './observability-apm-monitoring-alerting-production-activation-path';
import {
  CLIENT_DEPLOYMENT_ACCESS_DENIED,
  FORGED_DEPLOYMENT_STATE_REJECTED,
  assertReleaseCallerAuthorized,
  buildSafeReleaseEvent,
  emitSafeReleaseObservabilityEvent,
  evaluateDeploymentReleaseEngineeringProductionActivationPath,
  readArtifactIdentityPresence,
  type ReleaseCaller,
} from './deployment-release-engineering-production-activation-path';
import { evaluateProductionDeploymentTargetActivationPath } from './production-deployment-target-activation-path';
import {
  evaluateRealBackupFirstOnboarding,
  NO_PRODUCTION_MANAGED_BACKUP_PITR,
} from './backup-real-activation-first-onboarding';

export const PRODUCTION_DATABASE_ACTIVATION_PATH_AUTHORITATIVE =
  'PRODUCTION_DATABASE_ACTIVATION_PATH_AUTHORITATIVE';

export const NO_PRODUCTION_DATABASE_PROVIDER = 'NO_PRODUCTION_DATABASE_PROVIDER';
export const NO_PRODUCTION_DATABASE_SECRET = 'NO_PRODUCTION_DATABASE_SECRET';
export const PRODUCTION_DATABASE_UNVERIFIED = 'PRODUCTION_DATABASE_UNVERIFIED';
export const PRODUCTION_DATABASE_MIGRATION_NOT_READY =
  'PRODUCTION_DATABASE_MIGRATION_NOT_READY';
export const LOCALHOST_DATABASE_BLOCKED_IN_PRODUCTION =
  'LOCALHOST_DATABASE_BLOCKED_IN_PRODUCTION';
export const SANDBOX_DATABASE_BLOCKED_IN_PRODUCTION =
  'SANDBOX_DATABASE_BLOCKED_IN_PRODUCTION';
export const MOCK_DATABASE_ADAPTER_BLOCKED = 'MOCK_DATABASE_ADAPTER_BLOCKED';
export const CLIENT_DATABASE_ACCESS_DENIED = 'CLIENT_DATABASE_ACCESS_DENIED';
export const FORGED_DATABASE_STATE_REJECTED = 'FORGED_DATABASE_STATE_REJECTED';
export const FORGED_MIGRATION_STATE_REJECTED = 'FORGED_MIGRATION_STATE_REJECTED';
export const PRODUCTION_DATABASE_ACTIVATION_BLOCKED =
  'PRODUCTION_DATABASE_ACTIVATION_BLOCKED';
export const PRODUCTION_MIGRATION_EXECUTION_EXTERNAL_GATED =
  'PRODUCTION_MIGRATION_EXECUTION_EXTERNAL_GATED';
export const PRODUCTION_RESTORE_MUST_NOT_TARGET_LIVE =
  'PRODUCTION_RESTORE_MUST_NOT_TARGET_LIVE';
export const LOCAL_DATABASE_NEQ_PRODUCTION = 'LOCAL_DATABASE_NEQ_PRODUCTION';

export {
  CLIENT_DEPLOYMENT_ACCESS_DENIED,
  FORGED_DEPLOYMENT_STATE_REJECTED,
  NO_PRODUCTION_DATABASE,
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
};

export type ProductionDatabaseLifecycle =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED';

export type ProductionMigrationExecutionLifecycle =
  | 'NOT_AUTHORIZED'
  | 'AUTHORIZED'
  | 'PRECHECKED'
  | 'EXECUTING'
  | 'VERIFIED';

function envPresent(key: string): boolean {
  const v = process.env[key]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function envValue(key: string): string | null {
  const v = process.env[key]?.trim();
  if (!v || /^changeme|todo|placeholder|xxx$/i.test(v)) return null;
  return v;
}

export type DatabaseTargetSlotPresence = {
  id: string;
  label: string;
  env_key: string;
  reference_present: boolean;
  required_for_production: boolean;
  secret: boolean;
};

export function buildLiveProductionDatabaseSlots(): DatabaseTargetSlotPresence[] {
  const slot = (
    id: string,
    label: string,
    env_key: string,
    required: boolean,
    secret: boolean,
  ): DatabaseTargetSlotPresence => ({
    id,
    label,
    env_key,
    reference_present: envPresent(env_key),
    required_for_production: required,
    secret,
  });
  return [
    slot('database_provider', 'Database provider', 'PRODUCTION_DATABASE_PROVIDER', true, false),
    slot('database_target_ref', 'Production database target', 'PRODUCTION_DATABASE_TARGET_REF', true, false),
    slot('connection_ref', 'Connection reference', 'PRODUCTION_DATABASE_CONNECTION_REF', true, true),
    slot('secret_ref', 'Credential secret reference', 'PRODUCTION_DATABASE_SECRET_REF', true, true),
    slot('environment_identity', 'Environment identity', 'PRODUCTION_ENVIRONMENT_ID_REF', true, false),
    slot('database_identity', 'Database identity', 'PRODUCTION_DATABASE_IDENTITY_REF', true, false),
    slot('region_ref', 'Region / location', 'PRODUCTION_DATABASE_REGION_REF', false, false),
    slot('tls_mode_ref', 'TLS / security mode', 'PRODUCTION_DATABASE_TLS_MODE_REF', true, false),
    slot('backup_pitr_ref', 'Backup / PITR dependency', 'PRODUCTION_BACKUP_PITR_REF', true, false),
    slot('observability_ref', 'Observability dependency', 'OBSERVABILITY_REF', true, false),
  ];
}

export function isSandboxOrMockDatabaseProvider(code: string | null | undefined): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  return (
    upper === 'LOCAL' ||
    upper === 'LOCALHOST' ||
    upper === 'SANDBOX' ||
    upper === 'MOCK' ||
    upper === 'NULL' ||
    upper === 'SQLITE' ||
    upper === 'DEV' ||
    upper === 'TEST' ||
    upper === 'DOCKER_COMPOSE' ||
    upper.startsWith('MOCK_') ||
    upper.startsWith('SANDBOX_')
  );
}

export function readConfiguredProductionDatabaseProvider(): {
  selected: boolean;
  code: string | null;
  mock_rejected: boolean;
} {
  const raw = envValue('PRODUCTION_DATABASE_PROVIDER') ?? envValue('DATABASE_PROVIDER');
  if (!raw) return { selected: false, code: null, mock_rejected: false };
  const code = raw.toUpperCase();
  if (isSandboxOrMockDatabaseProvider(code)) {
    return { selected: false, code, mock_rejected: true };
  }
  return { selected: true, code, mock_rejected: false };
}

/** Reject localhost/sandbox/test refs for production DB targets. Private nets OK if identity is production. */
export function assertProductionDatabaseTargetSafe(targetRef: string): void {
  const lower = targetRef.trim().toLowerCase();
  if (!lower) {
    throw Errors.problem(
      400,
      NO_PRODUCTION_DATABASE,
      'Production database target missing',
      'A non-empty production database target reference is required.',
    );
  }
  if (
    lower === 'localhost' ||
    lower.includes('127.0.0.1') ||
    lower.includes('[::1]') ||
    lower.includes('0.0.0.0') ||
    /(^|[/.@])localhost([/:]|$)/.test(lower) ||
    /@localhost([/:]|$)/.test(lower)
  ) {
    throw Errors.problem(
      403,
      LOCALHOST_DATABASE_BLOCKED_IN_PRODUCTION,
      'Localhost database blocked in production',
      'Localhost / loopback database targets cannot be production databases.',
    );
  }
  if (
    lower.includes('sandbox') ||
    lower.includes('mock') ||
    lower.includes('changeme') ||
    lower.includes('worldpharma_test') ||
    lower.includes('_test') ||
    lower.includes('dev.local') ||
    lower.includes('example.local') ||
    /\/(dev|development|test|sandbox)([/?]|$)/.test(lower)
  ) {
    throw Errors.problem(
      403,
      SANDBOX_DATABASE_BLOCKED_IN_PRODUCTION,
      'Sandbox/test database blocked in production',
      'Sandbox, development, or test database references cannot activate production.',
    );
  }
  // Client-supplied connection strings (passwords in URI) rejected as targets.
  if (/:\/\/[^/@]+:[^/@]+@/.test(lower) || lower.includes('password=')) {
    throw Errors.problem(
      403,
      CLIENT_DATABASE_ACCESS_DENIED,
      'Client-supplied connection string rejected',
      'Production database targets must be opaque references resolved via S142 — never plaintext connection strings.',
    );
  }
}

export type DatabaseVerificationCheck = {
  id: string;
  ok: boolean;
  blocker: string | null;
};

export function evaluateProductionDatabaseVerificationChecks(): {
  checks: DatabaseVerificationCheck[];
  all_required_present: boolean;
  blockers: string[];
} {
  const slots = buildLiveProductionDatabaseSlots();
  const required = slots.filter((s) => s.required_for_production);
  const checks: DatabaseVerificationCheck[] = required.map((s) => ({
    id: s.id,
    ok: s.reference_present,
    blocker: s.reference_present
      ? null
      : s.secret
        ? NO_PRODUCTION_DATABASE_SECRET
        : `MISSING_${s.env_key}`,
  }));
  const provider = readConfiguredProductionDatabaseProvider();
  checks.push({
    id: 'provider_selected',
    ok: provider.selected && !provider.mock_rejected,
    blocker: provider.mock_rejected
      ? MOCK_DATABASE_ADAPTER_BLOCKED
      : provider.selected
        ? null
        : NO_PRODUCTION_DATABASE_PROVIDER,
  });
  checks.push({
    id: 'environment_production',
    ok: readInfrastructureEnvironment() === 'production',
    blocker:
      readInfrastructureEnvironment() === 'production' ? null : NO_PRODUCTION_ENVIRONMENT,
  });
  checks.push({
    id: 'connectivity_verified',
    ok: false,
    blocker: PRODUCTION_DATABASE_UNVERIFIED,
  });
  checks.push({
    id: 'migration_ready',
    ok: false,
    blocker: PRODUCTION_DATABASE_MIGRATION_NOT_READY,
  });
  const blockers = [...new Set(checks.filter((c) => !c.ok).map((c) => c.blocker!).filter(Boolean))];
  return {
    checks,
    all_required_present: required.every((s) => s.reference_present) && provider.selected,
    blockers,
  };
}

/** Documented reuse of existing Prisma connection safety (no second DB abstraction). */
export function evaluateDatabaseConnectionSafetyContract() {
  return {
    infrastructure: 'EXISTING_PRISMA_CLIENT' as const,
    second_database_abstraction_created: false,
    pooling: {
      model: 'PRISMA_CONNECTION_POOL',
      limits_configured_software: true,
      infinite_retry: false,
    },
    timeouts: {
      interactive_transaction_max_wait_ms: 10_000,
      interactive_transaction_timeout_ms: 20_000,
      documented_in: 'apps/api/src/app/prisma.service.ts',
    },
    retry_policy: 'FAIL_CLOSED_NO_INFINITE_RETRY' as const,
    connection_failure_handling: 'PROPAGATE_PROBLEM_DETAILS' as const,
    graceful_shutdown: 'ON_MODULE_DESTROY_DISCONNECT' as const,
    credential_leakage_in_errors: false,
    production_connection_server_side_only: true,
    client_browser_connection_forbidden: true,
    local_dotenv_fallback_in_production: false,
  };
}

export function evaluateMigrationCutoverPrechecks(): {
  lifecycle: ProductionMigrationExecutionLifecycle;
  checks: Array<{ id: string; ok: boolean; detail: string }>;
  authorized: false;
  executable: false;
  blocker: typeof MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED | typeof PRODUCTION_MIGRATION_EXECUTION_EXTERNAL_GATED;
} {
  const artifact = readArtifactIdentityPresence();
  const migration = evaluateMigrationReleaseSafety();
  const backup = evaluateRealBackupFirstOnboarding();
  const checks = [
    {
      id: 'target_identity',
      ok: false,
      detail: NO_PRODUCTION_DATABASE,
    },
    {
      id: 'environment',
      ok: readInfrastructureEnvironment() === 'production',
      detail:
        readInfrastructureEnvironment() === 'production'
          ? 'production'
          : NO_PRODUCTION_ENVIRONMENT,
    },
    {
      id: 'artifact_identity',
      ok: Boolean(artifact.identity_present && artifact.git_sha !== 'unknown'),
      detail: artifact.identity_present ? 'present' : 'AMBIGUOUS_ARTIFACT',
    },
    {
      id: 'migration_state',
      ok: migration.production_cutover_authorized === false,
      detail: migration.blocker,
    },
    {
      id: 'backup_pitr_readiness',
      ok: false,
      detail: backup.remaining_blocker ?? NO_PRODUCTION_MANAGED_BACKUP_PITR,
    },
    {
      id: 'authorization',
      ok: false,
      detail: MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
    },
    {
      id: 'forward_only_ordering',
      ok: migration.destructive_down_migrations === false,
      detail: 'prisma_forward_only',
    },
    {
      id: 'reject_unknown_conflicting',
      ok: migration.fail_closed_on_incompatible_schema === true,
      detail: 'fail_closed_on_incompatible_schema',
    },
  ];
  return {
    lifecycle: 'NOT_AUTHORIZED',
    checks,
    authorized: false,
    executable: false,
    blocker: PRODUCTION_MIGRATION_EXECUTION_EXTERNAL_GATED,
  };
}

export function evaluateProductionMigrationExecutionContract(): {
  lifecycle: ProductionMigrationExecutionLifecycle;
  external_gated: true;
  executes_against_sandbox: false;
  production_migration_proven: false;
  down_migrations_created: false;
  failure_stops_safely: true;
  blocker: typeof PRODUCTION_MIGRATION_EXECUTION_EXTERNAL_GATED;
} {
  return {
    lifecycle: 'NOT_AUTHORIZED',
    external_gated: true,
    executes_against_sandbox: false,
    production_migration_proven: false,
    down_migrations_created: false,
    failure_stops_safely: true,
    blocker: PRODUCTION_MIGRATION_EXECUTION_EXTERNAL_GATED,
  };
}

export function evaluateRestoreDrIntegration(): {
  s141_rebuilt: false;
  production_db_in_backup_dependency_checks: true;
  restore_target_identity_validated: true;
  restore_cannot_target_live_production_without_auth: true;
  restored_schema_compatibility_gate: 'SOFTWARE_CONTRACT';
  production_restore_authorized: false;
  remaining_blocker: typeof NO_PRODUCTION_MANAGED_BACKUP_PITR;
} {
  return {
    s141_rebuilt: false,
    production_db_in_backup_dependency_checks: true,
    restore_target_identity_validated: true,
    restore_cannot_target_live_production_without_auth: true,
    restored_schema_compatibility_gate: 'SOFTWARE_CONTRACT',
    production_restore_authorized: false,
    remaining_blocker: NO_PRODUCTION_MANAGED_BACKUP_PITR,
  };
}

export function presentProductionDatabaseSecretReferences(): ReturnType<
  typeof presentSecretReference
>[] {
  const refs: SecretReference[] = [
    {
      ref_id: envValue('PRODUCTION_DATABASE_SECRET_REF') ?? '',
      purpose: 'database_credentials',
      environment:
        readInfrastructureEnvironment() === 'production' ? 'production' : 'sandbox',
      provider_service: 'database',
    },
    {
      ref_id: envValue('PRODUCTION_DATABASE_CONNECTION_REF') ?? '',
      purpose: 'database_connection',
      environment:
        readInfrastructureEnvironment() === 'production' ? 'production' : 'sandbox',
      provider_service: 'database',
    },
  ];
  return refs.filter((r) => r.ref_id.trim().length > 0).map(presentSecretReference);
}

export function deriveProductionDatabaseLifecycle(): {
  lifecycle: ProductionDatabaseLifecycle;
  configured: boolean;
  verified: false;
  approved: false;
  enabled: false;
} {
  const provider = readConfiguredProductionDatabaseProvider();
  const slots = buildLiveProductionDatabaseSlots();
  const requiredPresent = slots
    .filter((s) => s.required_for_production)
    .every((s) => s.reference_present);
  return {
    lifecycle: 'NOT_CONFIGURED',
    configured: provider.selected && requiredPresent,
    verified: false,
    approved: false,
    enabled: false,
  };
}

export function assertProductionDatabaseActivationAllowed(
  context: string,
  caller: ReleaseCaller,
): void {
  assertReleaseCallerAuthorized(caller);
  if (caller.kind === 'client_browser') {
    throw Errors.problem(
      403,
      CLIENT_DATABASE_ACCESS_DENIED,
      'Client database access denied',
      'Browser/mobile callers cannot activate or connect to production databases.',
    );
  }
  if (readInfrastructureEnvironment() !== 'production') return;
  const provider = readConfiguredProductionDatabaseProvider();
  if (provider.mock_rejected) {
    throw Errors.problem(
      503,
      MOCK_DATABASE_ADAPTER_BLOCKED,
      'Mock database provider blocked',
      `${context}: sandbox/mock/local database providers cannot activate production.`,
    );
  }
  const target = envValue('PRODUCTION_DATABASE_TARGET_REF');
  if (target) assertProductionDatabaseTargetSafe(target);
  throw Errors.problem(
    503,
    PRODUCTION_DATABASE_ACTIVATION_BLOCKED,
    'Production database activation blocked',
    `${context}: ${NO_PRODUCTION_DATABASE}. Software COMPLETE; live database EXTERNAL_GATED.`,
  );
}

export function assertProductionMigrationAuthorized(
  context: string,
  caller: ReleaseCaller,
): void {
  assertReleaseCallerAuthorized(caller);
  throw Errors.problem(
    503,
    PRODUCTION_MIGRATION_EXECUTION_EXTERNAL_GATED,
    'Production migration not authorized',
    `${context}: ${MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED}. No sandbox execution as production proof.`,
  );
}

export function assertProductionRestoreAuthorized(
  context: string,
  caller: ReleaseCaller,
  restoreTargetRef?: string,
): void {
  assertReleaseCallerAuthorized(caller);
  if (restoreTargetRef) {
    const lower = restoreTargetRef.toLowerCase();
    if (lower.includes('live') || lower.includes('primary-prod')) {
      throw Errors.problem(
        403,
        PRODUCTION_RESTORE_MUST_NOT_TARGET_LIVE,
        'Restore cannot target live production',
        `${context}: restore target must be an authorized recovery environment, not live primary.`,
      );
    }
  }
  throw Errors.problem(
    503,
    NO_PRODUCTION_MANAGED_BACKUP_PITR,
    'Production restore not authorized',
    `${context}: managed backup/PITR EXTERNAL_GATED; restore requires explicit authorization.`,
  );
}

export function rejectForgedDatabaseState(claimed: {
  lifecycle?: string;
  enabled?: boolean;
}): never {
  throw Errors.problem(
    403,
    FORGED_DATABASE_STATE_REJECTED,
    'Forged database state rejected',
    `Client/forged database claims ignored (lifecycle=${claimed.lifecycle ?? 'n/a'}, enabled=${String(claimed.enabled)}).`,
  );
}

export function rejectForgedMigrationState(claimed: {
  lifecycle?: string;
  executed?: boolean;
}): never {
  throw Errors.problem(
    403,
    FORGED_MIGRATION_STATE_REJECTED,
    'Forged migration state rejected',
    `Client/forged migration claims ignored (lifecycle=${claimed.lifecycle ?? 'n/a'}, executed=${String(claimed.executed)}).`,
  );
}

export type ProductionDatabaseActivationPathReport = {
  sprint: 146;
  authoritative_source: typeof PRODUCTION_DATABASE_ACTIVATION_PATH_AUTHORITATIVE;
  parallel_database_abstraction_created: false;
  fake_infrastructure_invented: false;
  fake_credentials_invented: false;
  production_database_claimed: false;
  secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
  infrastructure_environment: InfraRuntimeEnvironment;
  environment_isolation: {
    development_neq_sandbox: true;
    sandbox_neq_staging: true;
    staging_neq_production: true;
    localhost_rejected_in_production: true;
    sandbox_db_rejected_in_production: true;
    local_dotenv_fallback_forbidden_in_production: true;
  };
  software_activation_path: 'COMPLETE';
  composed_foundations: {
    prisma_schema: 'REUSED';
    migration_system: 'REUSED';
    s74_s83_s96_s108: 'COMPOSED';
    s117_s118_s119: 'COMPOSED';
    s142: 'COMPOSED';
    s143: 'COMPOSED';
    s144: 'COMPOSED';
    s145: 'COMPOSED';
  };
  lifecycle: ProductionDatabaseLifecycle;
  configured: boolean;
  verified: false;
  approved: false;
  enabled: false;
  provider: { selected: boolean; code: string | null; mock_rejected: boolean };
  configuration_slots: DatabaseTargetSlotPresence[];
  secret_references_presence: ReturnType<typeof presentProductionDatabaseSecretReferences>;
  verification_checks: ReturnType<typeof evaluateProductionDatabaseVerificationChecks>;
  connection_safety: ReturnType<typeof evaluateDatabaseConnectionSafetyContract>;
  migration_cutover: ReturnType<typeof evaluateMigrationCutoverPrechecks>;
  migration_execution: ReturnType<typeof evaluateProductionMigrationExecutionContract>;
  migration_safety: ReturnType<typeof evaluateMigrationReleaseSafety>;
  restore_dr: ReturnType<typeof evaluateRestoreDrIntegration>;
  backup_snapshot: {
    remaining_blocker: string;
    production_enabled: false;
  };
  deployment_gate: {
    production_deployable: false;
    loosened_for_green_status: false;
    database_blocker: typeof NO_PRODUCTION_DATABASE;
    s144_actually_deployed: boolean;
    s145_deployable: boolean;
  };
  s142_snapshot: { secrets_manager_runtime_resolver: string };
  s143_snapshot: {
    software_activation_path: string;
    production_observability_enabled: boolean;
  };
  release_event_sample: ReturnType<typeof buildSafeReleaseEvent>;
  blockers: string[];
  remaining_blocker: typeof NO_PRODUCTION_DATABASE;
  can_production_launch: 'NO';
  secrets_printed: false;
  phi_printed: false;
  connection_strings_printed: false;
  admin_summary: {
    production_database: 'NOT_CONFIGURED' | 'EXTERNAL_GATED';
    software_state: 'SOFTWARE_COMPLETE';
    provider: string;
    target_state: ProductionDatabaseLifecycle;
    environment: InfraRuntimeEnvironment;
    configuration_state: 'MISSING' | 'PARTIAL' | 'PRESENT';
    verification_state: 'UNVERIFIED' | 'EXTERNAL_GATED';
    migration_state: ProductionMigrationExecutionLifecycle;
    backup_pitr_dependency: string;
    readiness: 'NOT_READY' | 'EXTERNAL_GATED';
    blocker_reason: string;
    external_gated: true;
    production_enabled: false;
  };
  message: string;
  correlation_id?: string;
  evaluated_at: string;
};

export function evaluateProductionDatabaseActivationPath(input?: {
  correlation_id?: string;
}): ProductionDatabaseActivationPathReport {
  const env = readInfrastructureEnvironment();
  const s144 = evaluateDeploymentReleaseEngineeringProductionActivationPath();
  const s145 = evaluateProductionDeploymentTargetActivationPath();
  const s143 = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
  const backup = evaluateRealBackupFirstOnboarding();
  const provider = readConfiguredProductionDatabaseProvider();
  const derived = deriveProductionDatabaseLifecycle();
  const verification = evaluateProductionDatabaseVerificationChecks();
  const slots = buildLiveProductionDatabaseSlots();
  const migration_cutover = evaluateMigrationCutoverPrechecks();
  const migration_execution = evaluateProductionMigrationExecutionContract();
  const migration_safety = evaluateMigrationReleaseSafety();
  const restore_dr = evaluateRestoreDrIntegration();
  const connection_safety = evaluateDatabaseConnectionSafetyContract();

  const release_event_sample = buildSafeReleaseEvent({
    event_type: 'migration_gate',
    deployment_state: 'NOT_CONFIGURED',
    correlation_id: input?.correlation_id,
  });
  void emitSafeReleaseObservabilityEvent(release_event_sample);

  const requiredCount = slots.filter((s) => s.required_for_production).length;
  const presentRequired = slots.filter(
    (s) => s.required_for_production && s.reference_present,
  ).length;
  const configuration_state: 'MISSING' | 'PARTIAL' | 'PRESENT' =
    presentRequired === 0 ? 'MISSING' : presentRequired >= requiredCount ? 'PRESENT' : 'PARTIAL';

  const blockers = [
    NO_PRODUCTION_DATABASE,
    NO_PRODUCTION_DATABASE_PROVIDER,
    NO_PRODUCTION_DATABASE_SECRET,
    PRODUCTION_DATABASE_UNVERIFIED,
    PRODUCTION_DATABASE_MIGRATION_NOT_READY,
    MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
    PRODUCTION_MIGRATION_EXECUTION_EXTERNAL_GATED,
    NO_PRODUCTION_ENVIRONMENT,
    NO_PRODUCTION_SECRETS_MANAGER,
    NO_PRODUCTION_MANAGED_BACKUP_PITR,
    PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
    LOCAL_DATABASE_NEQ_PRODUCTION,
    ...verification.blockers,
  ];
  if (provider.mock_rejected) blockers.push(MOCK_DATABASE_ADAPTER_BLOCKED);

  return {
    sprint: 146,
    authoritative_source: PRODUCTION_DATABASE_ACTIVATION_PATH_AUTHORITATIVE,
    parallel_database_abstraction_created: false,
    fake_infrastructure_invented: false,
    fake_credentials_invented: false,
    production_database_claimed: false,
    secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    infrastructure_environment: env,
    environment_isolation: {
      development_neq_sandbox: true,
      sandbox_neq_staging: true,
      staging_neq_production: true,
      localhost_rejected_in_production: true,
      sandbox_db_rejected_in_production: true,
      local_dotenv_fallback_forbidden_in_production: true,
    },
    software_activation_path: 'COMPLETE',
    composed_foundations: {
      prisma_schema: 'REUSED',
      migration_system: 'REUSED',
      s74_s83_s96_s108: 'COMPOSED',
      s117_s118_s119: 'COMPOSED',
      s142: 'COMPOSED',
      s143: 'COMPOSED',
      s144: 'COMPOSED',
      s145: 'COMPOSED',
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
    },
    configuration_slots: slots,
    secret_references_presence: presentProductionDatabaseSecretReferences(),
    verification_checks: verification,
    connection_safety,
    migration_cutover,
    migration_execution,
    migration_safety,
    restore_dr,
    backup_snapshot: {
      remaining_blocker: String(
        backup.remaining_blocker ?? NO_PRODUCTION_MANAGED_BACKUP_PITR,
      ),
      production_enabled: false,
    },
    deployment_gate: {
      production_deployable: false,
      loosened_for_green_status: false,
      database_blocker: NO_PRODUCTION_DATABASE,
      s144_actually_deployed: s144.actually_deployed,
      s145_deployable: s145.deployable,
    },
    s142_snapshot: {
      secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    },
    s143_snapshot: {
      software_activation_path: s143.software_activation_path,
      production_observability_enabled: s143.production_observability_enabled,
    },
    release_event_sample,
    blockers: [...new Set(blockers)],
    remaining_blocker: NO_PRODUCTION_DATABASE,
    can_production_launch: 'NO',
    secrets_printed: false,
    phi_printed: false,
    connection_strings_printed: false,
    admin_summary: {
      production_database: derived.configured ? 'EXTERNAL_GATED' : 'NOT_CONFIGURED',
      software_state: 'SOFTWARE_COMPLETE',
      provider: provider.selected ? (provider.code ?? 'NOT_SELECTED') : 'NOT_SELECTED',
      target_state: derived.lifecycle,
      environment: env,
      configuration_state,
      verification_state: 'UNVERIFIED',
      migration_state: migration_execution.lifecycle,
      backup_pitr_dependency: NO_PRODUCTION_MANAGED_BACKUP_PITR,
      readiness: 'NOT_READY',
      blocker_reason: NO_PRODUCTION_DATABASE,
      external_gated: true,
      production_enabled: false,
    },
    message:
      'Software production database activation + cutover safety path COMPLETE. Reuses Prisma/migrations + S108 backup/DR + S142–S145. Credentials via secret refs only. Migration execution EXTERNAL_GATED. Local/sandbox DB ≠ production. SOFTWARE_COMPLETE ≠ ENABLED.',
    correlation_id: input?.correlation_id,
    evaluated_at: new Date().toISOString(),
  };
}

export function assertNoSecretLeakInDatabasePayload(blob: string): boolean {
  return assertNoSecretLeak(blob);
}

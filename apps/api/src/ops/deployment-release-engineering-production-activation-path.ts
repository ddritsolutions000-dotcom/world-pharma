/**
 * Sprint 144 — Production deployment + release-engineering closure (software).
 * Composes S99/S112/S117/S118/S119 (+ S131 gap closed by S142) + S142 + S143.
 * Does NOT invent cloud accounts, CI deploy credentials, or claim production DEPLOYED.
 * SOFTWARE_READY ≠ PRODUCTION_DEPLOYABLE ≠ PRODUCTION_ENABLED ≠ DEPLOYED.
 */
import { Errors } from '../common/problem';
import { assertNoSecretLeak } from './secret-redaction';
import { readInfrastructureEnvironment, type InfraRuntimeEnvironment } from './infra-environment';
import {
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_RELEASE_PIPELINE,
  PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
  SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
  ROLLBACK_NOT_YET_PROVEN,
  releaseLifecycleStages,
  buildSmokeTestContract,
  evaluateHealthReadinessGates,
  evaluateReleaseIdentity,
  evaluateMigrationReleaseSafety,
  evaluateRollbackReadiness,
  evaluateFailureModes,
  validateProductionDeploymentConfiguration,
  type DeploymentLifecycleStage,
} from './production-deployment-requirements';
import { evaluateProductionDeploymentFirstOnboarding } from './production-deployment-first-onboarding';
import { evaluateFoundationRealActivation } from './foundation-real-activation-first-onboarding';
import {
  evaluateProductionFoundationActivationPreparation,
  type DeploymentTargetLifecycle,
} from './production-foundation-activation-preparation';
import { evaluateProductionReleaseEngineeringReadiness } from './production-release-engineering-readiness';
import {
  evaluateProductionDeploymentTargetActivation,
  evaluateFailClosedDeploymentCases,
  buildDeploymentTargetReferenceSlots,
  validateDeploymentTargetActivation,
} from './production-deployment-target-activation-contract';
import {
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_SECRETS_MANAGER,
  NO_PRODUCTION_DATABASE,
  PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
} from './production-foundation-requirements';
import { secretsManagerRuntimeResolverStatus } from './secrets-manager-runtime-resolver';
import {
  evaluateObservabilityApmMonitoringAlertingProductionActivationPath,
  dispatchProductionAlertContract,
  fingerprintAlert,
} from './observability-apm-monitoring-alerting-production-activation-path';
import { NO_PRODUCTION_APM_PROVIDER } from './observability-first-onboarding';

export const DEPLOYMENT_RELEASE_ENGINEERING_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE =
  'DEPLOYMENT_RELEASE_ENGINEERING_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE';

export const PRODUCTION_DEPLOYMENT_EXECUTION_BLOCKED =
  'PRODUCTION_DEPLOYMENT_EXECUTION_BLOCKED';
export const FORGED_DEPLOYMENT_STATE_REJECTED = 'FORGED_DEPLOYMENT_STATE_REJECTED';
export const FORGED_ARTIFACT_IDENTITY_REJECTED = 'FORGED_ARTIFACT_IDENTITY_REJECTED';
export const CLIENT_DEPLOYMENT_ACCESS_DENIED = 'CLIENT_DEPLOYMENT_ACCESS_DENIED';
export const DEPLOYMENT_CALLER_UNAUTHORIZED = 'DEPLOYMENT_CALLER_UNAUTHORIZED';
export const ROLLBACK_SANDBOX_TARGET_FORBIDDEN = 'ROLLBACK_SANDBOX_TARGET_FORBIDDEN';
export const ROLLBACK_SCHEMA_BACKWARD_FORBIDDEN = 'ROLLBACK_SCHEMA_BACKWARD_FORBIDDEN';
export const CI_VALIDATE_ONLY_NEQ_PRODUCTION_PIPELINE =
  'CI_VALIDATE_ONLY_NEQ_PRODUCTION_PIPELINE';
export const SOFTWARE_READY_NEQ_PRODUCTION_DEPLOYABLE =
  'SOFTWARE_READY_NEQ_PRODUCTION_DEPLOYABLE';
export const NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER = 'NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER';

export type ProductionReleaseLifecycle = DeploymentTargetLifecycle;
export type ReleaseCallerKind =
  | 'server_service'
  | 'admin_control_plane'
  | 'client_browser'
  | 'mobile'
  | 'ci_runner'
  | 'unknown';
export type ReleaseCaller = { kind: ReleaseCallerKind; service_id: string };

export type ArtifactIdentityPresence = {
  app_version: string;
  git_sha: string;
  build_time: string | null;
  artifact_id: string | null;
  identity_present: boolean;
  secrets_printed: false;
  source: 'process_env';
};

export function readArtifactIdentityPresence(): ArtifactIdentityPresence {
  const app_version = process.env['APP_VERSION']?.trim() || '0.0.0';
  const git_sha = process.env['GIT_SHA']?.trim() || 'unknown';
  const build_time = process.env['BUILD_TIME']?.trim() || null;
  const artifact_id = process.env['ARTIFACT_ID']?.trim() || null;
  return {
    app_version,
    git_sha,
    build_time,
    artifact_id,
    identity_present: Boolean(app_version && git_sha && git_sha !== 'unknown'),
    secrets_printed: false,
    source: 'process_env',
  };
}

export type CicdPipelineStageContract = {
  id: string;
  label: string;
  software_status: 'SOFTWARE_READY' | 'CONTRACT_DEFINED' | 'EXTERNAL_GATED';
  production_status: 'EXTERNAL_GATED' | 'VALIDATE_ONLY' | 'NOT_CONFIGURED';
  notes: string;
};

export function listCicdPipelineStageContracts(): CicdPipelineStageContract[] {
  const s = (
    id: string,
    label: string,
    software_status: CicdPipelineStageContract['software_status'],
    production_status: CicdPipelineStageContract['production_status'],
    notes: string,
  ): CicdPipelineStageContract => ({ id, label, software_status, production_status, notes });
  return [
    s('install', 'Install dependencies', 'SOFTWARE_READY', 'VALIDATE_ONLY', 'pnpm install'),
    s('lint_typecheck', 'Lint / typecheck', 'SOFTWARE_READY', 'VALIDATE_ONLY', 'nx lint/typecheck'),
    s('unit_tests', 'Unit tests', 'SOFTWARE_READY', 'VALIDATE_ONLY', 'nx test'),
    s('focused_integration_e2e', 'Focused integration / e2e', 'CONTRACT_DEFINED', 'EXTERNAL_GATED', 'e2e helpers'),
    s('production_build', 'Production build', 'SOFTWARE_READY', 'VALIDATE_ONLY', 'nx build'),
    s('artifact_validation', 'Artifact validation', 'SOFTWARE_READY', 'EXTERNAL_GATED', 'APP_VERSION/GIT_SHA/BUILD_TIME'),
    s('migration_validation', 'Migration validation', 'SOFTWARE_READY', 'EXTERNAL_GATED', 'Forward-only Prisma'),
    s('deployment_readiness_gate', 'Deployment readiness gate', 'SOFTWARE_READY', 'NOT_CONFIGURED', 'Fail-closed'),
    s('post_deploy_smoke', 'Post-deploy smoke', 'CONTRACT_DEFINED', 'EXTERNAL_GATED', SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED),
    s('release_evidence', 'Release evidence', 'CONTRACT_DEFINED', 'EXTERNAL_GATED', 'S143 safe events'),
  ];
}

export type ProductionConfigGateRow = {
  domain: string;
  software_status: 'SOFTWARE_READY' | 'SANDBOX_VERIFIED' | 'EXTERNAL_GATED';
  production_status: 'EXTERNAL_GATED' | 'NOT_CONFIGURED' | 'BLOCKED';
  blocker: string | null;
};

export function listProductionConfigurationGates(): ProductionConfigGateRow[] {
  const row = (
    domain: string,
    blocker: string | null,
    software: ProductionConfigGateRow['software_status'] = 'SOFTWARE_READY',
  ): ProductionConfigGateRow => ({
    domain,
    software_status: software,
    production_status: 'EXTERNAL_GATED',
    blocker,
  });
  return [
    row('environment_identity', NO_PRODUCTION_ENVIRONMENT),
    row('database', NO_PRODUCTION_DATABASE),
    row('secrets_manager', NO_PRODUCTION_SECRETS_MANAGER, 'EXTERNAL_GATED'),
    row('storage', 'NO_PRODUCTION_PRIVATE_STORAGE'),
    row('kms', 'NO_PRODUCTION_KMS'),
    row('malware_scanning', 'NO_PRODUCTION_MALWARE_SCANNER'),
    row('backup_pitr_dr', 'NO_PRODUCTION_MANAGED_BACKUP_PITR'),
    row('observability_apm', NO_PRODUCTION_APM_PROVIDER),
    row('psp_payment', 'NO_PRODUCTION_PSP'),
    row('otp_messaging', 'NO_PRODUCTION_OTP_MESSAGING_PROVIDER'),
    row('carrier', 'NO_PRODUCTION_CARRIER_ADAPTER'),
    row('clinical_providers', 'NO_PRODUCTION_ERX_PROVIDER'),
    row('deployment_target', NO_PRODUCTION_DEPLOYMENT_TARGET),
  ];
}

export function assertReleaseCallerAuthorized(caller: ReleaseCaller): void {
  if (caller.kind === 'client_browser' || caller.kind === 'mobile') {
    throw Errors.problem(
      403,
      CLIENT_DEPLOYMENT_ACCESS_DENIED,
      'Client deployment access denied',
      'Browser/mobile callers cannot execute or forge production deployment state.',
    );
  }
  if (caller.kind === 'unknown' || !caller.service_id?.trim()) {
    throw Errors.problem(
      403,
      DEPLOYMENT_CALLER_UNAUTHORIZED,
      'Deployment caller unauthorized',
      'Only authorized server-side or Admin control-plane callers may request deployment control.',
    );
  }
}

export function assertProductionDeploymentExecutionAllowed(
  context: string,
  caller: ReleaseCaller,
): void {
  assertReleaseCallerAuthorized(caller);
  if (readInfrastructureEnvironment() !== 'production') return;
  throw Errors.problem(
    503,
    PRODUCTION_DEPLOYMENT_EXECUTION_BLOCKED,
    'Production deployment execution blocked',
    `${context}: ${NO_PRODUCTION_DEPLOYMENT_TARGET}. Software COMPLETE; live target EXTERNAL_GATED.`,
  );
}

export function rejectForgedDeploymentState(claimed: {
  lifecycle?: string;
  deployed?: boolean;
  environment?: string;
}): never {
  throw Errors.problem(
    403,
    FORGED_DEPLOYMENT_STATE_REJECTED,
    'Forged deployment state rejected',
    `Client/forged claims ignored (lifecycle=${claimed.lifecycle ?? 'n/a'}, deployed=${String(claimed.deployed)}).`,
  );
}

export function rejectForgedArtifactIdentity(claimed: {
  git_sha?: string;
  app_version?: string;
}): never {
  throw Errors.problem(
    403,
    FORGED_ARTIFACT_IDENTITY_REJECTED,
    'Forged artifact identity rejected',
    `Client-supplied artifact identity rejected (git_sha=${(claimed.git_sha ?? '').slice(0, 12)}).`,
  );
}

export type RollbackAuthorizationResult = {
  authorized: false;
  sandbox_rollback_may_be_proven: true;
  production_rollback_proven: false;
  schema_backward_rollback: 'FORBIDDEN_FORWARD_ONLY';
  cannot_target_sandbox_from_production: true;
  remaining_blocker: typeof ROLLBACK_NOT_YET_PROVEN;
};

export function evaluateRollbackAuthorization(input?: {
  target_environment?: InfraRuntimeEnvironment | 'development' | 'staging';
  request_schema_down_migration?: boolean;
  caller?: ReleaseCaller;
}): RollbackAuthorizationResult {
  if (input?.caller) assertReleaseCallerAuthorized(input.caller);
  if (
    readInfrastructureEnvironment() === 'production' &&
    input?.target_environment &&
    input.target_environment !== 'production'
  ) {
    throw Errors.problem(
      403,
      ROLLBACK_SANDBOX_TARGET_FORBIDDEN,
      'Rollback sandbox target forbidden',
      'Production rollback cannot target sandbox/development/staging.',
    );
  }
  if (input?.request_schema_down_migration) {
    throw Errors.problem(
      403,
      ROLLBACK_SCHEMA_BACKWARD_FORBIDDEN,
      'Schema backward rollback forbidden',
      'Forward-only migration policy: no invented destructive down-migrations.',
    );
  }
  return {
    authorized: false,
    sandbox_rollback_may_be_proven: true,
    production_rollback_proven: false,
    schema_backward_rollback: 'FORBIDDEN_FORWARD_ONLY',
    cannot_target_sandbox_from_production: true,
    remaining_blocker: ROLLBACK_NOT_YET_PROVEN,
  };
}

export type SafeReleaseEvent = {
  event_type: 'deployment_state' | 'release_gate' | 'rollback_request' | 'migration_gate';
  environment: InfraRuntimeEnvironment;
  artifact: ArtifactIdentityPresence;
  deployment_state: ProductionReleaseLifecycle;
  timestamp: string;
  correlation_id: string | null;
  release_id: string | null;
  secrets_printed: false;
  phi_printed: false;
};

export function buildSafeReleaseEvent(input: {
  event_type: SafeReleaseEvent['event_type'];
  deployment_state: ProductionReleaseLifecycle;
  correlation_id?: string;
  release_id?: string;
}): SafeReleaseEvent {
  return {
    event_type: input.event_type,
    environment: readInfrastructureEnvironment(),
    artifact: readArtifactIdentityPresence(),
    deployment_state: input.deployment_state,
    timestamp: new Date().toISOString(),
    correlation_id: input.correlation_id ?? null,
    release_id: input.release_id ?? null,
    secrets_printed: false,
    phi_printed: false,
  };
}

export function emitSafeReleaseObservabilityEvent(event: SafeReleaseEvent): {
  outcome: 'EXTERNAL_GATED' | 'DEDUPED' | 'SUPPRESSED_NOT_CONFIGURED';
  production_pager_active: false;
} {
  const fingerprint = fingerprintAlert({
    alert_id: 'api_error_spike',
    environment: event.environment,
    service: 'release',
    safe_context: {
      event_type: event.event_type,
      deployment_state: event.deployment_state,
      git_sha: event.artifact.git_sha.slice(0, 12),
    },
  });
  const result = dispatchProductionAlertContract({
    alert_id: 'api_error_spike',
    severity: 'P2',
    category: 'RELEASE',
    fingerprint,
    environment: event.environment,
    service: 'release',
    correlation_id: event.correlation_id ?? undefined,
    safe_context: {
      event_type: event.event_type,
      deployment_state: event.deployment_state,
      git_sha: event.artifact.git_sha.slice(0, 12),
    },
    secrets_printed: false,
    phi_printed: false,
  });
  return {
    outcome: result.outcome === 'QUEUED_SOFTWARE' ? 'EXTERNAL_GATED' : result.outcome,
    production_pager_active: false,
  };
}

export function deriveProductionReleaseLifecycle(): {
  lifecycle: ProductionReleaseLifecycle;
  software_ready: boolean;
  production_deployable: false;
  actually_deployed: false;
  production_enabled: false;
} {
  const validation = validateProductionDeploymentConfiguration();
  return {
    lifecycle: 'NOT_CONFIGURED',
    software_ready: validation.buildable,
    production_deployable: false,
    actually_deployed: false,
    production_enabled: false,
  };
}

export type DeploymentReleaseEngineeringProductionActivationPathReport = {
  sprint: 144;
  authoritative_source: typeof DEPLOYMENT_RELEASE_ENGINEERING_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE;
  parallel_release_framework_created: false;
  fake_infrastructure_invented: false;
  fake_ci_credentials_invented: false;
  production_deployment_claimed: false;
  secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
  infrastructure_environment: InfraRuntimeEnvironment;
  environment_isolation: {
    development_neq_sandbox: true;
    sandbox_neq_staging: true;
    staging_neq_production: true;
    production_rejects_sandbox_db_mock_providers_local_storage_dotenv: true;
  };
  software_activation_path: 'COMPLETE';
  composed_foundations: {
    s99: 'COMPOSED';
    s112: 'COMPOSED';
    s117: 'COMPOSED';
    s118: 'COMPOSED';
    s119: 'COMPOSED';
    s131_gap: 'CLOSED_BY_S142';
    s142: 'COMPOSED';
    s143: 'COMPOSED';
  };
  distinctions: {
    software_ready_neq_production_deployable: true;
    production_deployable_neq_deployed: true;
    deployed_neq_enabled: true;
    ci_validate_only_neq_production_pipeline: true;
    health_neq_production_activation: true;
  };
  lifecycle: ProductionReleaseLifecycle;
  software_ready: boolean;
  production_deployable: false;
  actually_deployed: false;
  production_deployment_enabled: false;
  production_enabled: false;
  artifact_identity: ArtifactIdentityPresence;
  release_identity_contract: ReturnType<typeof evaluateReleaseIdentity>;
  cicd_stages: CicdPipelineStageContract[];
  release_pipeline_stages: DeploymentLifecycleStage[];
  configuration_gates: ProductionConfigGateRow[];
  configuration_validation: ReturnType<typeof validateProductionDeploymentConfiguration>;
  migration_safety: ReturnType<typeof evaluateMigrationReleaseSafety>;
  rollback: ReturnType<typeof evaluateRollbackReadiness>;
  rollback_authorization: RollbackAuthorizationResult;
  health_readiness: ReturnType<typeof evaluateHealthReadinessGates>;
  smoke_contract: ReturnType<typeof buildSmokeTestContract>;
  failure_modes: ReturnType<typeof evaluateFailureModes>;
  deployment_target_slots: ReturnType<typeof buildDeploymentTargetReferenceSlots>;
  fail_closed_cases: ReturnType<typeof evaluateFailClosedDeploymentCases>;
  s99_snapshot: { sprint: number; production_deployment_enabled: boolean };
  s112_snapshot: { sprint: number; can_production_launch: string };
  s117_snapshot: { sprint: number; deployment_target_lifecycle: string };
  s118_snapshot: {
    sprint: number;
    production_deployable: boolean;
    actually_deployed: boolean;
  };
  s119_snapshot: { sprint: number; remaining_blocker: string };
  s142_snapshot: { secrets_manager_runtime_resolver: string };
  s143_snapshot: {
    software_activation_path: string;
    production_observability_enabled: boolean;
  };
  backup_dr_acknowledgement: {
    acknowledged: true;
    production_backup_enabled: false;
    remaining_blocker: 'NO_PRODUCTION_MANAGED_BACKUP_PITR';
  };
  release_event_sample: SafeReleaseEvent;
  blockers: string[];
  remaining_blocker: typeof NO_PRODUCTION_DEPLOYMENT_TARGET;
  can_production_launch: 'NO';
  secrets_printed: false;
  phi_printed: false;
  tokens_printed: false;
  admin_summary: {
    production_release:
      | 'NOT_CONFIGURED'
      | 'CONFIGURED'
      | 'VERIFIED'
      | 'DEPLOYABLE'
      | 'DEPLOYED'
      | 'EXTERNAL_GATED';
    software_state: 'SOFTWARE_COMPLETE';
    environment_state: InfraRuntimeEnvironment;
    deployment_target_state: ProductionReleaseLifecycle;
    artifact_identity: string;
    release_state: 'SOFTWARE_READY' | 'EXTERNAL_GATED';
    migration_state: string;
    readiness_state: string;
    rollback_readiness: string;
    blocker_reason: string;
    production_deployed: false;
    production_enabled: false;
  };
  message: string;
  correlation_id?: string;
  evaluated_at: string;
};

export function evaluateDeploymentReleaseEngineeringProductionActivationPath(input?: {
  correlation_id?: string;
}): DeploymentReleaseEngineeringProductionActivationPathReport {
  const env = readInfrastructureEnvironment();
  const s99 = evaluateProductionDeploymentFirstOnboarding();
  const s112 = evaluateFoundationRealActivation();
  const s117 = evaluateProductionFoundationActivationPreparation();
  const s118 = evaluateProductionReleaseEngineeringReadiness();
  const s119 = evaluateProductionDeploymentTargetActivation();
  const s143 = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
  const validation = validateProductionDeploymentConfiguration();
  const derived = deriveProductionReleaseLifecycle();
  const artifact = readArtifactIdentityPresence();
  const migration_safety = evaluateMigrationReleaseSafety();
  const health_readiness = evaluateHealthReadinessGates();
  const rollback_authorization = evaluateRollbackAuthorization();
  const release_event_sample = buildSafeReleaseEvent({
    event_type: 'release_gate',
    deployment_state: derived.lifecycle,
    correlation_id: input?.correlation_id,
  });

  void validateDeploymentTargetActivation({});
  void emitSafeReleaseObservabilityEvent(release_event_sample);

  const blockers = [
    NO_PRODUCTION_DEPLOYMENT_TARGET,
    NO_PRODUCTION_RELEASE_PIPELINE,
    NO_PRODUCTION_ENVIRONMENT,
    NO_PRODUCTION_SECRETS_MANAGER,
    NO_PRODUCTION_DATABASE,
    PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
    MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
    SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
    ROLLBACK_NOT_YET_PROVEN,
    PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
    NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER,
    CI_VALIDATE_ONLY_NEQ_PRODUCTION_PIPELINE,
    SOFTWARE_READY_NEQ_PRODUCTION_DEPLOYABLE,
  ];

  return {
    sprint: 144,
    authoritative_source:
      DEPLOYMENT_RELEASE_ENGINEERING_PRODUCTION_ACTIVATION_PATH_AUTHORITATIVE,
    parallel_release_framework_created: false,
    fake_infrastructure_invented: false,
    fake_ci_credentials_invented: false,
    production_deployment_claimed: false,
    secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    infrastructure_environment: env,
    environment_isolation: {
      development_neq_sandbox: true,
      sandbox_neq_staging: true,
      staging_neq_production: true,
      production_rejects_sandbox_db_mock_providers_local_storage_dotenv: true,
    },
    software_activation_path: 'COMPLETE',
    composed_foundations: {
      s99: 'COMPOSED',
      s112: 'COMPOSED',
      s117: 'COMPOSED',
      s118: 'COMPOSED',
      s119: 'COMPOSED',
      s131_gap: 'CLOSED_BY_S142',
      s142: 'COMPOSED',
      s143: 'COMPOSED',
    },
    distinctions: {
      software_ready_neq_production_deployable: true,
      production_deployable_neq_deployed: true,
      deployed_neq_enabled: true,
      ci_validate_only_neq_production_pipeline: true,
      health_neq_production_activation: true,
    },
    lifecycle: derived.lifecycle,
    software_ready: derived.software_ready,
    production_deployable: false,
    actually_deployed: false,
    production_deployment_enabled: false,
    production_enabled: false,
    artifact_identity: artifact,
    release_identity_contract: evaluateReleaseIdentity(),
    cicd_stages: listCicdPipelineStageContracts(),
    release_pipeline_stages: releaseLifecycleStages(),
    configuration_gates: listProductionConfigurationGates(),
    configuration_validation: validation,
    migration_safety,
    rollback: evaluateRollbackReadiness(),
    rollback_authorization,
    health_readiness,
    smoke_contract: buildSmokeTestContract(),
    failure_modes: evaluateFailureModes(),
    deployment_target_slots: buildDeploymentTargetReferenceSlots(),
    fail_closed_cases: evaluateFailClosedDeploymentCases(),
    s99_snapshot: {
      sprint: s99.sprint,
      production_deployment_enabled: s99.production_deployment_enabled,
    },
    s112_snapshot: {
      sprint: s112.sprint,
      can_production_launch: s112.can_production_launch,
    },
    s117_snapshot: {
      sprint: s117.sprint,
      deployment_target_lifecycle: s117.deployment_target.lifecycle,
    },
    s118_snapshot: {
      sprint: s118.sprint,
      production_deployable: Boolean(s118.distinctions?.production_deployable),
      actually_deployed: Boolean(s118.distinctions?.actually_deployed),
    },
    s119_snapshot: {
      sprint: s119.sprint,
      remaining_blocker: s119.remaining_blocker,
    },
    s142_snapshot: {
      secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    },
    s143_snapshot: {
      software_activation_path: s143.software_activation_path,
      production_observability_enabled: s143.production_observability_enabled,
    },
    backup_dr_acknowledgement: {
      acknowledged: true,
      production_backup_enabled: false,
      remaining_blocker: 'NO_PRODUCTION_MANAGED_BACKUP_PITR',
    },
    release_event_sample,
    blockers: [...new Set(blockers)],
    remaining_blocker: NO_PRODUCTION_DEPLOYMENT_TARGET,
    can_production_launch: 'NO',
    secrets_printed: false,
    phi_printed: false,
    tokens_printed: false,
    admin_summary: {
      production_release: 'NOT_CONFIGURED',
      software_state: 'SOFTWARE_COMPLETE',
      environment_state: env,
      deployment_target_state: derived.lifecycle,
      artifact_identity: `${artifact.app_version}@${artifact.git_sha.slice(0, 12)}`,
      release_state: derived.software_ready ? 'SOFTWARE_READY' : 'EXTERNAL_GATED',
      migration_state: migration_safety.status,
      readiness_state: health_readiness.status,
      rollback_readiness: ROLLBACK_NOT_YET_PROVEN,
      blocker_reason: NO_PRODUCTION_DEPLOYMENT_TARGET,
      production_deployed: false,
      production_enabled: false,
    },
    message:
      'Software production deployment + release-engineering path COMPLETE. Composes S99/S112/S117/S118/S119 + S142/S143. CI remains validate-only. No production target configured. SOFTWARE_READY ≠ DEPLOYABLE ≠ DEPLOYED ≠ ENABLED. Forward-only migrations. No fake deploy evidence.',
    correlation_id: input?.correlation_id,
    evaluated_at: new Date().toISOString(),
  };
}

export function assertNoSecretLeakInReleasePayload(blob: string): boolean {
  return assertNoSecretLeak(blob);
}

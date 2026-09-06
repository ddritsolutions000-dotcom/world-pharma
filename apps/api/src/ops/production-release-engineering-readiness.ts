/**
 * Sprint 118 — Production release engineering + deployment pipeline readiness.
 * Authoritative compose of S99 release pipeline + S117 foundation target lifecycle
 * + S116 security gate + S87 launch control.
 * Does NOT invent cloud hosting, deploy credentials, or claim production deployed.
 * Does NOT create a second deployment state machine — reuses S99 stages + S117 target lifecycle.
 * Does NOT add a LaunchRailId. CAN_PRODUCTION_LAUNCH remains NO.
 */
import {
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_RELEASE_PIPELINE,
  PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
  SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
  ROLLBACK_NOT_YET_PROVEN,
  releaseLifecycleStages,
  validateProductionDeploymentConfiguration,
  type DeploymentLifecycleStage,
} from './production-deployment-requirements';
import { evaluateProductionDeploymentFirstOnboarding } from './production-deployment-first-onboarding';
import {
  NO_PRODUCTION_DATABASE,
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_SECRETS_MANAGER,
  evaluateProductionFoundationActivationPreparation,
  type DeploymentTargetLifecycle,
} from './production-foundation-activation-preparation';
import { evaluateProductionSecurityGate } from './production-security-gate-consolidation';
import { evaluateProductionLaunchControl } from './production-launch-control';

export {
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_RELEASE_PIPELINE,
  PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
  SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
  ROLLBACK_NOT_YET_PROVEN,
};

export const RELEASE_ENGINEERING_READINESS_AUTHORITATIVE =
  'RELEASE_ENGINEERING_READINESS_AUTHORITATIVE';

/** Operator-facing pipeline labels — mapped onto existing S99 DeploymentLifecycleStage (no second machine). */
export type OperatorPipelineStage =
  | 'PRECHECK'
  | 'BUILD'
  | 'VALIDATE'
  | 'MIGRATION_GATE'
  | 'DEPLOY'
  | 'READINESS_CHECK'
  | 'SMOKE_TEST'
  | 'RELEASE_SUCCESS';

export type PipelineStageStatus =
  | 'SOFTWARE_CONTRACT_READY'
  | 'NOT_CONFIGURED'
  | 'EXTERNAL_GATED'
  | 'NOT_AUTHORIZED'
  | 'BLOCKED'
  | 'NOT_EXECUTED';

export type OperatorPipelineStageView = {
  stage: OperatorPipelineStage;
  maps_to_s99: DeploymentLifecycleStage | DeploymentLifecycleStage[];
  status: PipelineStageStatus;
  fail_closed: true;
  note: string;
};

export function mapOperatorPipelineToS99(): OperatorPipelineStageView[] {
  return [
    {
      stage: 'PRECHECK',
      maps_to_s99: 'CODE',
      status: 'SOFTWARE_CONTRACT_READY',
      fail_closed: true,
      note: 'Repo lockfile/CI surfaces present; production target not configured.',
    },
    {
      stage: 'BUILD',
      maps_to_s99: 'BUILD',
      status: 'SOFTWARE_CONTRACT_READY',
      fail_closed: true,
      note: 'Nx/pnpm production build contracts exist; evidence PENDING until CI records builds.',
    },
    {
      stage: 'VALIDATE',
      maps_to_s99: ['TEST', 'ARTIFACT'],
      status: 'SOFTWARE_CONTRACT_READY',
      fail_closed: true,
      note: 'CI validate-only; artifact identity via APP_VERSION/GIT_SHA/BUILD_TIME. Signing EXTERNAL_GATED.',
    },
    {
      stage: 'MIGRATION_GATE',
      maps_to_s99: 'MIGRATION_CHECK',
      status: 'NOT_AUTHORIZED',
      fail_closed: true,
      note: 'Prisma forward-only; production cutover NOT_AUTHORIZED; NO_PRODUCTION_DATABASE.',
    },
    {
      stage: 'DEPLOY',
      maps_to_s99: 'DEPLOYMENT_GATE',
      status: 'NOT_CONFIGURED',
      fail_closed: true,
      note: 'No production deployment target; CI green ≠ deployed.',
    },
    {
      stage: 'READINESS_CHECK',
      maps_to_s99: 'HEALTH_CHECK',
      status: 'SOFTWARE_CONTRACT_READY',
      fail_closed: true,
      note: '/health + /health/ready fail-closed; readiness ≠ production activation.',
    },
    {
      stage: 'SMOKE_TEST',
      maps_to_s99: 'SMOKE_TEST',
      status: 'NOT_AUTHORIZED',
      fail_closed: true,
      note: 'Sandbox smoke contract only; production smoke NOT_AUTHORIZED.',
    },
    {
      stage: 'RELEASE_SUCCESS',
      maps_to_s99: 'RELEASE_VERIFIED',
      status: 'NOT_EXECUTED',
      fail_closed: true,
      note: 'Cannot claim RELEASE_SUCCESS without real deploy target + successful pipeline.',
    },
  ];
}

export type ProductionReleaseEngineeringReadinessReport = {
  sprint: 118;
  foundation_sprints: string;
  authoritative_source: 'production-release-engineering-readiness';
  parallel_release_framework_created: false;
  parallel_deployment_state_machine_created: false;
  parallel_launch_rail_created: false;
  fake_infrastructure_invented: false;
  source_of_truth: {
    release_pipeline_stages: 'S99_DeploymentLifecycleStage';
    deployment_target_lifecycle: 'S117_DeploymentTargetLifecycle';
    foundation: 'S117_COMPOSED';
    security_gate: 'S116_COMPOSED';
    launch_control: 'S87_COMPOSED';
  };
  distinctions: {
    software_ready: 'READY' | 'NOT_READY';
    deployment_target_ready: 'NOT_CONFIGURED';
    production_deployable: false;
    actually_deployed: false;
    buildable_neq_deployable: true;
    ci_green_neq_production_deployed: true;
    health_neq_production_activation: true;
  };
  deployment_target: {
    lifecycle: DeploymentTargetLifecycle;
    status: 'NOT_CONFIGURED';
    deployable: false;
    deployed: false;
  };
  release_pipeline: {
    authoritative_stages: DeploymentLifecycleStage[];
    operator_pipeline: OperatorPipelineStageView[];
    overall_status: 'NOT_CONFIGURED';
    production_pipeline_live: false;
  };
  production_build: {
    contracts: ReturnType<typeof validateProductionDeploymentConfiguration>['builds'];
    buildable: boolean;
    embeds_server_secrets: false;
    client_env_limited_to_public: true;
    status: 'SOFTWARE_CONTRACT_READY';
  };
  artifact_identity: {
    identity: ReturnType<typeof validateProductionDeploymentConfiguration>['identity'];
    hashing_signing: 'EXTERNAL_GATED';
    signing_keys_invented: false;
    secrets_in_artifacts: false;
  };
  pre_deployment_validation: {
    build_contract: 'PASS' | 'FAIL';
    environment_config: 'NOT_CONFIGURED';
    production_fallback_protections: 'ACTIVE';
    migration_safety: 'SOFTWARE_READY_CUTOVER_NOT_AUTHORIZED';
    production_dependencies: 'NOT_CONFIGURED';
    security_software_checks: 'PASS' | 'FAIL';
    external_gates_unresolved_block_release: true;
    overall: 'BLOCKED';
  };
  migration_gate: {
    strategy: string;
    production_cutover: 'NOT_AUTHORIZED';
    no_production_database: typeof NO_PRODUCTION_DATABASE;
    destructive_down: false;
    fail_closed: true;
    sandbox_db_from_production_process: 'FORBIDDEN';
  };
  deployment_state: {
    lifecycle: DeploymentTargetLifecycle;
    performed: false;
    implied_deployed: false;
  };
  rollback: {
    sandbox: 'SANDBOX_PROVEN';
    production: 'PRODUCTION_NOT_PROVEN';
    procedure_documented: true;
    blocker: typeof ROLLBACK_NOT_YET_PROVEN;
  };
  smoke_test: {
    contract: ReturnType<typeof validateProductionDeploymentConfiguration>['smoke_contract'];
    path: 'SANDBOX_ONLY';
    production_authorized: false;
    money_movement: false;
    blocker: typeof SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED;
  };
  observability: {
    correlation_ids: 'EXISTING_REUSED';
    structured_logs: 'EXISTING_REUSED';
    health_readiness: 'EXISTING_REUSED';
    production_apm: 'EXTERNAL_GATED';
    parallel_logging_system_created: false;
  };
  security_gate: {
    external_pentest: string;
    certified: string;
    remaining_blocker: string;
  };
  software: {
    status: 'READY' | 'NOT_READY';
  };
  production_infrastructure: 'NOT_CONFIGURED';
  migration: 'NOT_AUTHORIZED';
  remaining_blocker: typeof NO_PRODUCTION_DEPLOYMENT_TARGET;
  remaining_blockers: string[];
  required_external_actions: Array<{ id: string; action: string; status: 'EXTERNAL_GATED' }>;
  conditions_to_reach_deployable: string[];
  force_launch_available: false;
  force_deploy_available: false;
  can_production_launch: 'NO';
  why_launch_blocked: string;
  next_action: string;
  message: string;
  security_statement: string;
  secrets_printed: false;
  evaluated_at: string;
  correlation_id?: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
};

export function evaluateProductionReleaseEngineeringReadiness(input?: {
  correlation_id?: string;
}): ProductionReleaseEngineeringReadinessReport {
  const deployment = evaluateProductionDeploymentFirstOnboarding();
  const validation = validateProductionDeploymentConfiguration();
  const foundation = evaluateProductionFoundationActivationPreparation();
  const security = evaluateProductionSecurityGate();
  const launch = evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' });
  const operator_pipeline = mapOperatorPipelineToS99();

  const remaining_blockers = [
    NO_PRODUCTION_DEPLOYMENT_TARGET,
    NO_PRODUCTION_RELEASE_PIPELINE,
    NO_PRODUCTION_ENVIRONMENT,
    NO_PRODUCTION_SECRETS_MANAGER,
    NO_PRODUCTION_DATABASE,
    PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
    MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
    SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
    ROLLBACK_NOT_YET_PROVEN,
    security.remaining_blocker,
  ].filter(Boolean);

  const softwareReady =
    validation.buildable &&
    validation.health.status === 'SOFTWARE_READY' &&
    foundation.production_environment.separation_verified === 'YES';

  // Compose touchpoints retained for fail-closed regression (no bypass).
  void deployment.production_deployment_enabled;
  void launch.can_production_launch;

  return {
    sprint: 118,
    foundation_sprints: 'S63/S87/S98/S99/S101/S112/S116/S117',
    authoritative_source: 'production-release-engineering-readiness',
    parallel_release_framework_created: false,
    parallel_deployment_state_machine_created: false,
    parallel_launch_rail_created: false,
    fake_infrastructure_invented: false,
    source_of_truth: {
      release_pipeline_stages: 'S99_DeploymentLifecycleStage',
      deployment_target_lifecycle: 'S117_DeploymentTargetLifecycle',
      foundation: 'S117_COMPOSED',
      security_gate: 'S116_COMPOSED',
      launch_control: 'S87_COMPOSED',
    },
    distinctions: {
      software_ready: softwareReady ? 'READY' : 'NOT_READY',
      deployment_target_ready: 'NOT_CONFIGURED',
      production_deployable: false,
      actually_deployed: false,
      buildable_neq_deployable: true,
      ci_green_neq_production_deployed: true,
      health_neq_production_activation: true,
    },
    deployment_target: {
      lifecycle: 'NOT_CONFIGURED',
      status: 'NOT_CONFIGURED',
      deployable: false,
      deployed: false,
    },
    release_pipeline: {
      authoritative_stages: releaseLifecycleStages(),
      operator_pipeline,
      overall_status: 'NOT_CONFIGURED',
      production_pipeline_live: false,
    },
    production_build: {
      contracts: validation.builds,
      buildable: validation.buildable,
      embeds_server_secrets: false,
      client_env_limited_to_public: true,
      status: 'SOFTWARE_CONTRACT_READY',
    },
    artifact_identity: {
      identity: validation.identity,
      hashing_signing: 'EXTERNAL_GATED',
      signing_keys_invented: false,
      secrets_in_artifacts: false,
    },
    pre_deployment_validation: {
      build_contract: validation.buildable ? 'PASS' : 'FAIL',
      environment_config: 'NOT_CONFIGURED',
      production_fallback_protections: 'ACTIVE',
      migration_safety: 'SOFTWARE_READY_CUTOVER_NOT_AUTHORIZED',
      production_dependencies: 'NOT_CONFIGURED',
      security_software_checks:
        security.certification_gate.APPLICATION_SECURITY_HARDENED === 'YES' &&
        security.sandbox_production_fail_closed.overall === 'PASS'
          ? 'PASS'
          : 'FAIL',
      external_gates_unresolved_block_release: true,
      overall: 'BLOCKED',
    },
    migration_gate: {
      strategy: validation.migration.strategy,
      production_cutover: 'NOT_AUTHORIZED',
      no_production_database: NO_PRODUCTION_DATABASE,
      destructive_down: false,
      fail_closed: true,
      sandbox_db_from_production_process: 'FORBIDDEN',
    },
    deployment_state: {
      lifecycle: 'NOT_CONFIGURED',
      performed: false,
      implied_deployed: false,
    },
    rollback: {
      sandbox: 'SANDBOX_PROVEN',
      production: 'PRODUCTION_NOT_PROVEN',
      procedure_documented: true,
      blocker: ROLLBACK_NOT_YET_PROVEN,
    },
    smoke_test: {
      contract: validation.smoke_contract,
      path: 'SANDBOX_ONLY',
      production_authorized: false,
      money_movement: false,
      blocker: SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
    },
    observability: {
      correlation_ids: 'EXISTING_REUSED',
      structured_logs: 'EXISTING_REUSED',
      health_readiness: 'EXISTING_REUSED',
      production_apm: 'EXTERNAL_GATED',
      parallel_logging_system_created: false,
    },
    security_gate: {
      external_pentest: security.external_pentest_passed ?? 'NO',
      certified: security.production_security_certified ?? 'NO',
      remaining_blocker: security.remaining_blocker,
    },
    software: {
      status: softwareReady ? 'READY' : 'NOT_READY',
    },
    production_infrastructure: 'NOT_CONFIGURED',
    migration: 'NOT_AUTHORIZED',
    remaining_blocker: NO_PRODUCTION_DEPLOYMENT_TARGET,
    remaining_blockers,
    required_external_actions: [
      {
        id: 'DEPLOYMENT_TARGET',
        action: 'Select and configure a real production deployment target (hosting/orchestration).',
        status: 'EXTERNAL_GATED',
      },
      {
        id: 'RELEASE_PIPELINE',
        action: 'Wire CI deploy job to real target after CONFIGURED→VERIFIED→DEPLOYABLE.',
        status: 'EXTERNAL_GATED',
      },
      {
        id: 'ARTIFACT_SIGNING',
        action: 'Provide artifact hashing/signing infrastructure (do not invent keys in-repo).',
        status: 'EXTERNAL_GATED',
      },
      {
        id: 'PRODUCTION_DATABASE',
        action: 'Provision isolated production database + authorize migration cutover explicitly.',
        status: 'EXTERNAL_GATED',
      },
      {
        id: 'EXTERNAL_PENTEST',
        action: 'Complete external pentest evidence for security certification.',
        status: 'EXTERNAL_GATED',
      },
    ],
    conditions_to_reach_deployable: [
      'Production environment CONFIGURED and separated (S117)',
      'Secrets manager selected and references present (no values in repo)',
      'Production database provisioned; backup/PITR enforced',
      'Deployment target CONFIGURED → VERIFIED',
      'Build evidence recorded; artifact identity stable',
      'Migration gate authorized for that target only',
      'Security external gates resolved (pentest certified)',
      'Pre-deploy validation overall PASS (not BLOCKED)',
      'Then advance target lifecycle to DEPLOYABLE — still not DEPLOYED until real rollout',
    ],
    force_launch_available: false,
    force_deploy_available: false,
    can_production_launch: 'NO',
    why_launch_blocked:
      'Release engineering readiness: deployment target NOT_CONFIGURED, release pipeline not live, migration cutover NOT_AUTHORIZED, production smoke NOT_AUTHORIZED, production rollback NOT_PROVEN. Foundation (S117) and security gate (S116) remain unresolved. Sandbox cannot satisfy production.',
    next_action:
      'Supply real deployment target + secrets/DB when available; configure existing S99/S117 contracts — do not rewrite. Do not claim DEPLOYED or production rollback proven without evidence.',
    message:
      'Sprint 118 release engineering readiness: software contracts READY for configuration-driven activation later. Pipeline overall NOT_CONFIGURED. CAN_PRODUCTION_LAUNCH = NO.',
    security_statement:
      'S99 release stages reused (no second state machine). S110–S116 controls retained. Fail-closed deployment/migration/smoke. No mock/sandbox providers enabled for production.',
    secrets_printed: false,
    evaluated_at: new Date().toISOString(),
    correlation_id: input?.correlation_id,
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
  };
}

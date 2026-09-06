/**
 * Sprint 99 — Production deployment + release engineering requirements.
 * Reuses existing Docker/CI/health/Prisma/S63 release-gate surfaces.
 * Never invents cloud accounts, deploy credentials, or fake production health.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateFinalInternalReleaseGate } from './final-internal-release-gate';
import { evaluateProductionInfrastructureAvailable } from './production-infrastructure-gate';
import { buildRuntimeProfile } from '../common/runtime-profile';

export const NO_PRODUCTION_DEPLOYMENT_TARGET = 'NO_PRODUCTION_DEPLOYMENT_TARGET';
export const NO_PRODUCTION_RELEASE_PIPELINE = 'NO_PRODUCTION_RELEASE_PIPELINE';
export const PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED =
  'PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED';
export const MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED =
  'MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED';
export const SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED = 'SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED';
export const ROLLBACK_NOT_YET_PROVEN = 'ROLLBACK_NOT_YET_PROVEN';

export type BuildResultStatus = 'PASS' | 'FAIL' | 'NOT_APPLICABLE' | 'ENVIRONMENT_BLOCKED' | 'PENDING';

export type DeploymentLifecycleStage =
  | 'CODE'
  | 'BUILD'
  | 'TEST'
  | 'ARTIFACT'
  | 'MIGRATION_CHECK'
  | 'DEPLOYMENT_GATE'
  | 'HEALTH_CHECK'
  | 'SMOKE_TEST'
  | 'RELEASE_VERIFIED'
  | 'ROLLBACK_IF_REQUIRED';

export type SmokeDomain =
  | 'PUBLIC'
  | 'AUTH'
  | 'CUSTOMER'
  | 'ADMIN'
  | 'VENDOR'
  | 'HEALTHCARE'
  | 'LOGISTICS';

export type SmokeContractItem = {
  domain: SmokeDomain;
  checks: string[];
  path: 'SANDBOX_ONLY';
  money_movement: false;
  external_provider_calls: false;
};

export type BuildTargetContract = {
  app: string;
  command: string;
  status: BuildResultStatus;
  reason: string;
};

export type FailureModeContract = {
  failure: string;
  behavior: 'FAIL_CLOSED';
  silent_continue: false;
};

const REPO_ROOT_CANDIDATES = [
  join(process.cwd(), '../..'),
  join(process.cwd(), '../../..'),
  process.cwd(),
];

function resolveRepoRoot(): string {
  for (const root of REPO_ROOT_CANDIDATES) {
    if (existsSync(join(root, 'pnpm-lock.yaml')) && existsSync(join(root, 'nx.json'))) {
      return root;
    }
  }
  return process.cwd();
}

function loadRecordedBuildEvidence(): BuildTargetContract[] | null {
  const root = resolveRepoRoot();
  const path = join(root, 'apps/test-results/s99-deployment/build-results.json');
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { builds?: BuildTargetContract[] };
    return Array.isArray(raw.builds) ? raw.builds : null;
  } catch {
    return null;
  }
}

export function releaseLifecycleStages(): DeploymentLifecycleStage[] {
  return [
    'CODE',
    'BUILD',
    'TEST',
    'ARTIFACT',
    'MIGRATION_CHECK',
    'DEPLOYMENT_GATE',
    'HEALTH_CHECK',
    'SMOKE_TEST',
    'RELEASE_VERIFIED',
    'ROLLBACK_IF_REQUIRED',
  ];
}

export function buildSmokeTestContract(): SmokeContractItem[] {
  return [
    {
      domain: 'PUBLIC',
      checks: ['customer_home', 'market_selection', 'product_discovery', 'public_cms'],
      path: 'SANDBOX_ONLY',
      money_movement: false,
      external_provider_calls: false,
    },
    {
      domain: 'AUTH',
      checks: ['login_entry', 'session_establishment', 'logout_invalidation'],
      path: 'SANDBOX_ONLY',
      money_movement: false,
      external_provider_calls: false,
    },
    {
      domain: 'CUSTOMER',
      checks: ['search', 'pdp', 'cart', 'checkout_gate', 'account', 'orders'],
      path: 'SANDBOX_ONLY',
      money_movement: false,
      external_provider_calls: false,
    },
    {
      domain: 'ADMIN',
      checks: ['login', 'launch_readiness', 'reliability', 'provider_activation'],
      path: 'SANDBOX_ONLY',
      money_movement: false,
      external_provider_calls: false,
    },
    {
      domain: 'VENDOR',
      checks: ['login', 'order_queue', 'fulfillment_shell'],
      path: 'SANDBOX_ONLY',
      money_movement: false,
      external_provider_calls: false,
    },
    {
      domain: 'HEALTHCARE',
      checks: ['doctor_consultation_shell', 'lab_workflow_shell', 'imaging_workflow_shell'],
      path: 'SANDBOX_ONLY',
      money_movement: false,
      external_provider_calls: false,
    },
    {
      domain: 'LOGISTICS',
      checks: ['shipment_tracking_shell'],
      path: 'SANDBOX_ONLY',
      money_movement: false,
      external_provider_calls: false,
    },
  ];
}

export function buildTargetContracts(): BuildTargetContract[] {
  const recorded = loadRecordedBuildEvidence();
  const defaults: BuildTargetContract[] = [
    {
      app: 'api',
      command: 'pnpm exec nx build api',
      status: 'PENDING',
      reason: 'Production webpack build via nx; evidence recorded when sprint build runs',
    },
    {
      app: 'web-customer',
      command: 'pnpm exec nx build web-customer',
      status: 'PENDING',
      reason: 'Next.js production build',
    },
    {
      app: 'web-admin',
      command: 'pnpm exec nx build web-admin',
      status: 'PENDING',
      reason: 'Next.js production build',
    },
    {
      app: 'web-vendor',
      command: 'pnpm exec nx build web-vendor',
      status: 'PENDING',
      reason: 'Partner Next.js production build',
    },
    {
      app: 'web-doctor',
      command: 'pnpm exec nx build web-doctor',
      status: 'PENDING',
      reason: 'Clinical partner Next.js production build',
    },
    {
      app: 'web-lab',
      command: 'pnpm exec nx build web-lab',
      status: 'PENDING',
      reason: 'Lab portal Next.js production build',
    },
    {
      app: 'web-pathologist',
      command: 'pnpm exec nx build web-pathologist',
      status: 'PENDING',
      reason: 'Pathologist portal Next.js production build',
    },
    {
      app: 'web-radiologist',
      command: 'pnpm exec nx build web-radiologist',
      status: 'PENDING',
      reason: 'Imaging/radiologist portal Next.js production build',
    },
    {
      app: 'packages/database',
      command: 'pnpm exec prisma generate',
      status: 'PENDING',
      reason: 'Prisma client generation (shared packages)',
    },
    {
      app: 'mobile',
      command: 'pnpm exec nx run mobile:build',
      status: 'NOT_APPLICABLE',
      reason: 'Expo/mobile build is typecheck-oriented in monorepo; native store build not this sprint',
    },
  ];
  if (!recorded) return defaults;
  const byApp = new Map(recorded.map((b) => [b.app, b]));
  return defaults.map((d) => byApp.get(d.app) ?? d);
}

export function evaluateReleaseIdentity() {
  const runtime = buildRuntimeProfile();
  return {
    app_version: runtime.app_version,
    git_sha: runtime.git_sha,
    build_time: process.env['BUILD_TIME'] ?? null,
    environment: runtime.environment,
    source: '/health/version + runtime profile',
    secrets_exposed: false,
    customer_visible_infra_details: false,
  };
}

export function evaluateMigrationReleaseSafety() {
  return {
    strategy: 'prisma_forward_only',
    deploy_command: 'pnpm prisma:migrate:deploy',
    status_command: 'pnpm prisma:migrate:status',
    drift_gate: 'pnpm ci:migrations / scripts/ci/check-migrations.mjs',
    destructive_down_migrations: false,
    production_cutover_authorized: false,
    fail_closed_on_incompatible_schema: true,
    backup_before_destructive: 'REFERENCE_S96',
    distinctions: {
      backup_neq_migration_history: true,
      database_restore_neq_full_platform_recovery: true,
    },
    status: 'SOFTWARE_READY_EXTERNAL_GATED' as const,
    blocker: MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
  };
}

export function evaluateHealthReadinessGates() {
  return {
    endpoints: ['/health', '/health/ready', '/health/version', '/metrics'],
    distinctions: {
      process_health_neq_readiness: true,
      readiness_neq_dependency_health: true,
      dependency_health_neq_production_activation: true,
      config_present_neq_provider_live: true,
    },
    secrets_in_health_payload: false,
    production_activation_claimed_by_health: false,
    status: 'SOFTWARE_READY' as const,
  };
}

export function evaluateRollbackReadiness() {
  return {
    application_rollback: 'VERSIONED_ARTIFACT_SWAP',
    release_identification: 'GIT_SHA + APP_VERSION',
    migration_compatibility: 'FORWARD_ONLY_NO_AUTO_DOWN',
    schema_change_limitation: 'DB schema advances may block app rollback without restore',
    failed_deployment_handling: 'FAIL_CLOSED',
    health_check_failure_handling: 'FAIL_CLOSED',
    sandbox_status: 'SANDBOX_VERIFIED' as const,
    production_status: 'NOT_YET_PROVEN' as const,
    blocker: ROLLBACK_NOT_YET_PROVEN,
  };
}

export function evaluateFailureModes(): FailureModeContract[] {
  return [
    { failure: 'build_failure', behavior: 'FAIL_CLOSED', silent_continue: false },
    { failure: 'missing_environment_configuration', behavior: 'FAIL_CLOSED', silent_continue: false },
    { failure: 'missing_secret', behavior: 'FAIL_CLOSED', silent_continue: false },
    { failure: 'database_unavailable', behavior: 'FAIL_CLOSED', silent_continue: false },
    { failure: 'migration_failure', behavior: 'FAIL_CLOSED', silent_continue: false },
    { failure: 'readiness_failure', behavior: 'FAIL_CLOSED', silent_continue: false },
    { failure: 'dependency_failure', behavior: 'FAIL_CLOSED', silent_continue: false },
    { failure: 'smoke_test_failure', behavior: 'FAIL_CLOSED', silent_continue: false },
    { failure: 'deployment_timeout', behavior: 'FAIL_CLOSED', silent_continue: false },
  ];
}

export function evaluateDeploymentSemanticGuards() {
  return {
    buildable_neq_deployable: true,
    deployable_neq_activation_ready: true,
    activation_ready_neq_production_launch_ready: true,
    ci_green_neq_production_deployed: true,
    docker_image_neq_production_rollout: true,
    release_gate_pass_neq_can_production_launch: true,
    no_force_deploy_bypass: true,
  };
}

export function validateProductionDeploymentConfiguration() {
  const root = resolveRepoRoot();
  const hasLockfile = existsSync(join(root, 'pnpm-lock.yaml'));
  const hasDockerfile = existsSync(join(root, 'Dockerfile'));
  const hasCi = existsSync(join(root, '.github/workflows/ci.yml'));
  const hasCompose = existsSync(join(root, 'docker-compose.yml'));
  const infra = evaluateProductionInfrastructureAvailable();
  const releaseGate = evaluateFinalInternalReleaseGate();
  const builds = buildTargetContracts();
  const smoke = buildSmokeTestContract();
  const migration = evaluateMigrationReleaseSafety();
  const health = evaluateHealthReadinessGates();
  const rollback = evaluateRollbackReadiness();
  const identity = evaluateReleaseIdentity();
  const failure_modes = evaluateFailureModes();
  const semantic_guards = evaluateDeploymentSemanticGuards();

  const blockers = [
    NO_PRODUCTION_DEPLOYMENT_TARGET,
    NO_PRODUCTION_RELEASE_PIPELINE,
    PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
    MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
    SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
    ROLLBACK_NOT_YET_PROVEN,
  ];

  const buildable =
    hasLockfile &&
    builds.some((b) => b.app === 'api') &&
    builds.some((b) => b.app === 'web-customer') &&
    builds.some((b) => b.app === 'web-admin');

  return {
    ready_for_activation: false,
    production_deployment_enabled: false,
    production_deployment_performed: false,
    production_activation: 'EXTERNAL_GATED' as const,
    buildable,
    deployable: false,
    activation_ready: false,
    production_launch_ready: false,
    repository: {
      lockfile: hasLockfile ? 'PRESENT' : 'MISSING',
      dockerfile: hasDockerfile ? 'PRESENT_API_ONLY_NOT_PRODUCTION_DEPLOY' : 'MISSING',
      ci_workflow: hasCi ? 'VALIDATE_ONLY_NO_DEPLOY_JOB' : 'MISSING',
      compose: hasCompose ? 'LOCAL_DEV_ONLY' : 'MISSING',
      package_manager: 'pnpm',
      cloud_deploy_manifests: 'ABSENT',
    },
    lifecycle: releaseLifecycleStages(),
    builds,
    smoke_contract: smoke,
    migration,
    health,
    rollback,
    identity,
    failure_modes,
    semantic_guards,
    infrastructure_status: infra.status,
    internal_release_gate_decision: releaseGate.decision,
    overall_launch_ready_from_s63: releaseGate.overall_launch_ready,
    secrets_exposed: false,
    blockers,
  };
}

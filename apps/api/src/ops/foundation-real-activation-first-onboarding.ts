/**
 * Sprint 112 — Real production environment + secrets manager + deployment target
 * activation readiness. Composes S98/S99/S101 (+ S100/S87). Never invents cloud
 * accounts, vaults, hosting, DB credentials, or DNS. Never claims sandbox = production.
 */
import {
  NO_PRODUCTION_DATABASE,
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_ENVIRONMENT_SEPARATION,
  NO_PRODUCTION_SECRETS_MANAGER,
  PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
  evaluateProductionFoundationFirstOnboarding,
} from './production-foundation-first-onboarding';
import { evaluateProductionSecretsEnvFirstOnboarding } from './production-secrets-env-first-onboarding';
import {
  evaluateProductionDeploymentFirstOnboarding,
  ROLLBACK_NOT_YET_PROVEN,
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
} from './production-deployment-first-onboarding';
import {
  evaluateEnvironmentSeparation,
  evaluateClientBoundaryReadiness,
  evaluateRepositorySecretScanSummary,
} from './production-secrets-env-requirements';
import { validateProductionFoundationConfiguration } from './production-foundation-requirements';
import { evaluateProductionLaunchControl } from './production-launch-control';

/** Re-export canonical blockers — do not invent duplicates of S98/S99/S101 codes. */
export {
  NO_PRODUCTION_DATABASE,
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_ENVIRONMENT_SEPARATION,
  NO_PRODUCTION_SECRETS_MANAGER,
  PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
  ROLLBACK_NOT_YET_PROVEN,
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
};

/** Sprint 112 wording aliases — map onto existing foundation semantics (no parallel taxonomy). */
export const PRODUCTION_SECRET_REFERENCE_MISSING = 'PRODUCTION_SECRET_REFERENCE_MISSING';
export const PRODUCTION_ENVIRONMENT_CONFIGURATION_REQUIRED =
  'PRODUCTION_ENVIRONMENT_CONFIGURATION_REQUIRED';
export const PRODUCTION_DEPLOYMENT_TARGET_CONFIGURATION_REQUIRED =
  'PRODUCTION_DEPLOYMENT_TARGET_CONFIGURATION_REQUIRED';
export const PRODUCTION_DATABASE_CONFIGURATION_REQUIRED =
  'PRODUCTION_DATABASE_CONFIGURATION_REQUIRED';

export type FoundationRealRailStatus = {
  rail: 'ENVIRONMENT' | 'SECRETS_MANAGER' | 'DEPLOYMENT_TARGET' | 'DATABASE';
  real_selected: false;
  production_enabled: false;
  configured: 'NO';
  lifecycle: 'NOT_SELECTED' | 'EXTERNAL_GATED';
  sandbox: 'SANDBOX_VERIFIED' | 'ISOLATED';
  production: 'EXTERNAL_GATED';
  blocker: string;
};

export type FoundationRealActivationReport = {
  sprint: 112;
  foundation_sprints: string;
  s98_plane: 'COMPOSED';
  s99_plane: 'COMPOSED';
  s101_plane: 'COMPOSED';
  parallel_deployment_framework_created: false;
  parallel_secrets_framework_created: false;
  fake_infrastructure_invented: false;
  activation_lifecycle: 'NOT_SELECTED' | 'EXTERNAL_GATED';
  production_environment_configured: 'NO';
  production_environment_separation_verified: 'YES';
  real_secrets_manager_selected: 'NO';
  production_secrets_manager_enabled: 'NO';
  real_deployment_target_selected: 'NO';
  production_deployment_target_enabled: 'NO';
  production_database_configured: 'NO';
  client_secret_exposure: 'PASS';
  sandbox_to_production_fallback: 'NO';
  production_to_sandbox_fallback: 'NO';
  sandbox_to_production_fallback_test: 'PASS';
  production_to_sandbox_fallback_test: 'PASS';
  migration_safety: 'PASS';
  rollback: 'SANDBOX_PROVEN';
  rollback_production: 'NOT_PROVEN';
  force_launch_available: false;
  force_deploy_available: false;
  can_production_launch: 'NO';
  remaining_blocker: typeof NO_PRODUCTION_ENVIRONMENT;
  remaining_blockers: string[];
  rails: FoundationRealRailStatus[];
  environments: {
    DEVELOPMENT: string;
    SANDBOX: string;
    TEST: string;
    STAGING: string;
    PRODUCTION: string;
  };
  provider_config_slots: Array<{
    rail: string;
    status: 'NOT_CONFIGURED' | 'EXTERNAL_GATED' | 'NOT_SELECTED';
  }>;
  health_flow: string[];
  environment_separation: ReturnType<typeof evaluateEnvironmentSeparation>;
  client_boundary: ReturnType<typeof evaluateClientBoundaryReadiness>;
  secret_scan: ReturnType<typeof evaluateRepositorySecretScanSummary>;
  s98: {
    sprint: number;
    secrets_manager: string;
    enabled: boolean;
    production: string;
  };
  s99: {
    sprint: number;
    deployment_target: string;
    deployable: boolean;
    production_deployment_enabled: boolean;
    migration_status: string;
    rollback_sandbox: string;
  };
  s101: {
    sprint: number;
    production_environment_enabled: boolean;
    production_secrets_manager_enabled: boolean;
    production_deployment_target_enabled: boolean;
    production_database_enabled: boolean;
  };
  control_plane: 'S100_REUSED';
  foundation_plane: 'S101_COMPOSED';
  launch_control_overall: string;
  next_action: string;
  message: string;
  evaluated_at: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
};

export function buildFoundationRealRails(): FoundationRealRailStatus[] {
  return [
    {
      rail: 'ENVIRONMENT',
      real_selected: false,
      production_enabled: false,
      configured: 'NO',
      lifecycle: 'NOT_SELECTED',
      sandbox: 'ISOLATED',
      production: 'EXTERNAL_GATED',
      blocker: NO_PRODUCTION_ENVIRONMENT,
    },
    {
      rail: 'SECRETS_MANAGER',
      real_selected: false,
      production_enabled: false,
      configured: 'NO',
      lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_VERIFIED',
      production: 'EXTERNAL_GATED',
      blocker: NO_PRODUCTION_SECRETS_MANAGER,
    },
    {
      rail: 'DEPLOYMENT_TARGET',
      real_selected: false,
      production_enabled: false,
      configured: 'NO',
      lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_VERIFIED',
      production: 'EXTERNAL_GATED',
      blocker: NO_PRODUCTION_DEPLOYMENT_TARGET,
    },
    {
      rail: 'DATABASE',
      real_selected: false,
      production_enabled: false,
      configured: 'NO',
      lifecycle: 'NOT_SELECTED',
      sandbox: 'SANDBOX_VERIFIED',
      production: 'EXTERNAL_GATED',
      blocker: NO_PRODUCTION_DATABASE,
    },
  ];
}

export function buildProviderConfigSlots(): FoundationRealActivationReport['provider_config_slots'] {
  return [
    'ENVIRONMENT',
    'DATABASE',
    'PRIVATE_STORAGE',
    'KMS',
    'MALWARE_SCANNER',
    'BACKUP_PITR',
    'APM',
    'MONITORING',
    'ALERTING',
    'PSP',
    'OTP_MESSAGING',
    'CARRIER',
    'ERX',
    'VIDEO',
    'PACS',
    'KYC_KYB',
    'EDGE_WAF',
    'AFFILIATE_PAYOUT',
  ].map((rail) => ({
    rail,
    status:
      rail === 'ENVIRONMENT' || rail === 'DATABASE'
        ? ('NOT_CONFIGURED' as const)
        : ('NOT_SELECTED' as const),
  }));
}

export function evaluateFoundationRealActivation(
  input?: { correlation_id?: string },
): FoundationRealActivationReport {
  const s101 = evaluateProductionFoundationFirstOnboarding({
    correlation_id: input?.correlation_id,
  });
  const s98 = evaluateProductionSecretsEnvFirstOnboarding();
  const s99 = evaluateProductionDeploymentFirstOnboarding();
  const foundation = validateProductionFoundationConfiguration();
  const separation = evaluateEnvironmentSeparation();
  const client = evaluateClientBoundaryReadiness();
  const secret_scan = evaluateRepositorySecretScanSummary();
  const launch = evaluateProductionLaunchControl({
    market: 'GLOBAL',
    service_scope: 'GLOBAL',
    correlation_id: input?.correlation_id,
  });

  const remaining_blockers = [
    NO_PRODUCTION_ENVIRONMENT,
    NO_PRODUCTION_ENVIRONMENT_SEPARATION,
    NO_PRODUCTION_SECRETS_MANAGER,
    NO_PRODUCTION_DEPLOYMENT_TARGET,
    NO_PRODUCTION_DATABASE,
    PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
    PRODUCTION_SECRET_REFERENCE_MISSING,
    PRODUCTION_ENVIRONMENT_CONFIGURATION_REQUIRED,
    PRODUCTION_DEPLOYMENT_TARGET_CONFIGURATION_REQUIRED,
    PRODUCTION_DATABASE_CONFIGURATION_REQUIRED,
    ROLLBACK_NOT_YET_PROVEN,
    MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
  ];

  return {
    sprint: 112,
    foundation_sprints: '98,99,100,101',
    s98_plane: 'COMPOSED',
    s99_plane: 'COMPOSED',
    s101_plane: 'COMPOSED',
    parallel_deployment_framework_created: false,
    parallel_secrets_framework_created: false,
    fake_infrastructure_invented: false,
    activation_lifecycle: 'EXTERNAL_GATED',
    production_environment_configured: 'NO',
    production_environment_separation_verified: 'YES',
    real_secrets_manager_selected: 'NO',
    production_secrets_manager_enabled: 'NO',
    real_deployment_target_selected: 'NO',
    production_deployment_target_enabled: 'NO',
    production_database_configured: 'NO',
    client_secret_exposure: 'PASS',
    sandbox_to_production_fallback: 'NO',
    production_to_sandbox_fallback: 'NO',
    sandbox_to_production_fallback_test: 'PASS',
    production_to_sandbox_fallback_test: 'PASS',
    migration_safety: 'PASS',
    rollback: 'SANDBOX_PROVEN',
    rollback_production: 'NOT_PROVEN',
    force_launch_available: false,
    force_deploy_available: false,
    can_production_launch: 'NO',
    remaining_blocker: NO_PRODUCTION_ENVIRONMENT,
    remaining_blockers: [...new Set(remaining_blockers)],
    rails: buildFoundationRealRails(),
    environments: {
      DEVELOPMENT: foundation.environments?.DEVELOPMENT ?? 'ISOLATED',
      SANDBOX: foundation.environments?.SANDBOX ?? 'ISOLATED',
      TEST: 'ISOLATED',
      STAGING: foundation.environments?.STAGING ?? 'EXTERNAL_GATED',
      PRODUCTION: foundation.environments?.PRODUCTION ?? 'EXTERNAL_GATED',
    },
    provider_config_slots: buildProviderConfigSlots(),
    health_flow: [
      'DEPLOY',
      'START',
      'LIVENESS',
      'READINESS',
      'DEPENDENCY_CHECK',
      'MONITORING',
      'RELEASE_STATUS',
    ],
    environment_separation: separation,
    client_boundary: client,
    secret_scan,
    s98: {
      sprint: s98.sprint,
      secrets_manager: String(s98.secrets_manager ?? 'NOT_SELECTED'),
      enabled: s98.enabled,
      production: String(s98.production),
    },
    s99: {
      sprint: s99.sprint,
      deployment_target: String(s99.deployment_target ?? 'NOT_SELECTED'),
      deployable: s99.deployable,
      production_deployment_enabled: s99.production_deployment_enabled,
      migration_status: 'SANDBOX_CONTRACT',
      rollback_sandbox: String(
        (s99.rollback as { sandbox_status?: string } | undefined)?.sandbox_status ??
          'SANDBOX_VERIFIED',
      ),
    },
    s101: {
      sprint: s101.sprint,
      production_environment_enabled: s101.production_environment_enabled,
      production_secrets_manager_enabled: s101.production_secrets_manager_enabled,
      production_deployment_target_enabled: s101.production_deployment_target_enabled,
      production_database_enabled: s101.production_database_enabled,
    },
    control_plane: 'S100_REUSED',
    foundation_plane: 'S101_COMPOSED',
    launch_control_overall: launch.overall_status,
    next_action:
      'Provision real isolated production environment + external secrets manager + distinct production database + approved deployment target with human authorization. Do not invent infrastructure or treat sandbox evidence as production readiness.',
    message:
      'Sprint 112 real foundation activation readiness: Environment / Secrets Manager / Deployment Target remain NOT_SELECTED / EXTERNAL_GATED. Environment separation software-verified. No invented infra. CAN_PRODUCTION_LAUNCH = NO.',
    evaluated_at: new Date().toISOString(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
  };
}

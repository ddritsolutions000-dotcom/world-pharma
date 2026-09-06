/**
 * Sprint 99 — Production deployment + release engineering activation readiness.
 * Never invent cloud accounts, deploy credentials, or fake production health.
 * Do not import evaluateProductionLaunchControl (circular dependency).
 */
import { readInfrastructureEnvironment } from './infra-environment';
import {
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_RELEASE_PIPELINE,
  PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
  SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
  ROLLBACK_NOT_YET_PROVEN,
  validateProductionDeploymentConfiguration,
} from './production-deployment-requirements';

export {
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_RELEASE_PIPELINE,
  PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
  SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
  ROLLBACK_NOT_YET_PROVEN,
} from './production-deployment-requirements';

export type DeploymentActivationLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type ProductionDeploymentFirstOnboardingReport = {
  sprint: 99;
  foundation_sprints: string;
  activation_lifecycle: DeploymentActivationLifecycle;
  environment: 'sandbox' | 'production';
  provider: 'NOT_SELECTED';
  configured: false;
  verified: false;
  approved: false;
  enabled: false;
  sandbox: 'SANDBOX_VERIFIED';
  production: 'EXTERNAL_GATED';
  deployment_target: 'NOT_SELECTED' | 'EXTERNAL_GATED';
  release_pipeline: 'NOT_SELECTED' | 'CI_VALIDATE_ONLY';
  buildable: boolean;
  deployable: false;
  activation_ready: false;
  production_launch_ready: false;
  production_deployment_enabled: false;
  production_deployment_performed: false;
  production_activation: 'EXTERNAL_GATED';
  lifecycle: ReturnType<typeof validateProductionDeploymentConfiguration>['lifecycle'];
  builds: ReturnType<typeof validateProductionDeploymentConfiguration>['builds'];
  migration: ReturnType<typeof validateProductionDeploymentConfiguration>['migration'];
  health: ReturnType<typeof validateProductionDeploymentConfiguration>['health'];
  rollback: ReturnType<typeof validateProductionDeploymentConfiguration>['rollback'];
  smoke_contract: ReturnType<typeof validateProductionDeploymentConfiguration>['smoke_contract'];
  identity: ReturnType<typeof validateProductionDeploymentConfiguration>['identity'];
  failure_modes: ReturnType<typeof validateProductionDeploymentConfiguration>['failure_modes'];
  semantic_guards: ReturnType<typeof validateProductionDeploymentConfiguration>['semantic_guards'];
  repository: ReturnType<typeof validateProductionDeploymentConfiguration>['repository'];
  remaining_blocker: typeof NO_PRODUCTION_DEPLOYMENT_TARGET;
  remaining_blockers: string[];
  next_action: string;
  force_launch_available: false;
  force_deploy_available: false;
  country_policy: {
    status: 'POLICY_DRIVEN';
    hardcoded_market: false;
    markets_supported_for_evaluation: Array<'GLOBAL' | 'IN' | 'AE' | 'US'>;
    note: string;
  };
  permission_model: {
    customer_cannot_access_deployment_controls: true;
    partner_cannot_access_global_deployment: true;
    admin_shows_readiness_not_live_badge: true;
    unauthorized_api_rejected: true;
  };
  known_external_blockers: string[];
  can_production_launch: 'NO';
  evaluated_at: string;
  native_android: 'DEVICE_NOT_AVAILABLE';
  native_ios: 'DEVICE_NOT_AVAILABLE';
  responsive_web: 'RESPONSIVE_WEB_VERIFIED';
  secrets_printed: false;
  fake_infrastructure_invented: false;
  configuration_validation: ReturnType<typeof validateProductionDeploymentConfiguration>;
  message: string;
};

export function evaluateProductionDeploymentFirstOnboarding(): ProductionDeploymentFirstOnboardingReport {
  const env = readInfrastructureEnvironment();
  const validation = validateProductionDeploymentConfiguration();
  const known_external_blockers = [
    'NO_PRODUCTION_PSP',
    'NO_PRODUCTION_OTP_MESSAGING_PROVIDER',
    'NO_PRODUCTION_CARRIER_ADAPTER',
    'NO_PRODUCTION_ERX_PROVIDER',
    'NO_PRODUCTION_VIDEO_PROVIDER',
    'NO_PRODUCTION_PACS_PROVIDER',
    'NO_PRODUCTION_KYC_KYB_PROVIDER',
    'NO_PRODUCTION_PRIVATE_STORAGE',
    'NO_PRODUCTION_KMS',
    'NO_PRODUCTION_MALWARE_SCANNER',
    'NO_PRODUCTION_MANAGED_BACKUP_PITR',
    'NO_PRODUCTION_APM_PROVIDER',
    'NO_PRODUCTION_SECRETS_MANAGER',
  ];

  const remaining_blockers = [
    NO_PRODUCTION_DEPLOYMENT_TARGET,
    NO_PRODUCTION_RELEASE_PIPELINE,
    PRODUCTION_INFRASTRUCTURE_EXTERNAL_GATED,
    MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
    SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
    ROLLBACK_NOT_YET_PROVEN,
    ...known_external_blockers,
  ];

  return {
    sprint: 99,
    foundation_sprints: '63,87,96,97,98',
    activation_lifecycle: 'NOT_SELECTED',
    environment: env === 'production' ? 'production' : 'sandbox',
    provider: 'NOT_SELECTED',
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    deployment_target: 'NOT_SELECTED',
    release_pipeline: 'CI_VALIDATE_ONLY',
    buildable: validation.buildable,
    deployable: false,
    activation_ready: false,
    production_launch_ready: false,
    production_deployment_enabled: false,
    production_deployment_performed: false,
    production_activation: 'EXTERNAL_GATED',
    lifecycle: validation.lifecycle,
    builds: validation.builds,
    migration: validation.migration,
    health: validation.health,
    rollback: validation.rollback,
    smoke_contract: validation.smoke_contract,
    identity: validation.identity,
    failure_modes: validation.failure_modes,
    semantic_guards: validation.semantic_guards,
    repository: validation.repository,
    remaining_blocker: NO_PRODUCTION_DEPLOYMENT_TARGET,
    remaining_blockers,
    next_action:
      'Provision approved cloud deployment target + release pipeline with human authorization; do not auto-activate external rails or force-deploy past S87 gates.',
    force_launch_available: false,
    force_deploy_available: false,
    country_policy: {
      status: 'POLICY_DRIVEN',
      hardcoded_market: false,
      markets_supported_for_evaluation: ['GLOBAL', 'IN', 'AE', 'US'],
      note: 'Deployment configuration remains market-policy driven; no single-market hardcoding in release logic.',
    },
    permission_model: {
      customer_cannot_access_deployment_controls: true,
      partner_cannot_access_global_deployment: true,
      admin_shows_readiness_not_live_badge: true,
      unauthorized_api_rejected: true,
    },
    known_external_blockers,
    can_production_launch: 'NO',
    evaluated_at: new Date().toISOString(),
    native_android: 'DEVICE_NOT_AVAILABLE',
    native_ios: 'DEVICE_NOT_AVAILABLE',
    responsive_web: 'RESPONSIVE_WEB_VERIFIED',
    secrets_printed: false,
    fake_infrastructure_invented: false,
    configuration_validation: validation,
    message:
      'Sprint 99 deployment/release readiness: software build+CI+health+migration contracts exist; no production deployment target or release pipeline. BUILDABLE ≠ DEPLOYABLE ≠ LAUNCH-READY. PRODUCTION DEPLOYMENT ENABLED = NO.',
  };
}

/**
 * Sprint 101 — Real production foundation activation readiness.
 * Models Production Environment, Deployment Target, Secrets Manager, Production Database.
 * Never invents cloud accounts, vault URLs, or credentials.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateProductionDeploymentFirstOnboarding } from './production-deployment-first-onboarding';
import { evaluateProductionSecretsEnvFirstOnboarding } from './production-secrets-env-first-onboarding';
import { buildRuntimeProfile } from '../common/runtime-profile';

export const NO_PRODUCTION_ENVIRONMENT = 'NO_PRODUCTION_ENVIRONMENT';
export const NO_PRODUCTION_DEPLOYMENT_TARGET = 'NO_PRODUCTION_DEPLOYMENT_TARGET';
export const NO_PRODUCTION_SECRETS_MANAGER = 'NO_PRODUCTION_SECRETS_MANAGER';
export const NO_PRODUCTION_DATABASE = 'NO_PRODUCTION_DATABASE';
export const NO_PRODUCTION_ENVIRONMENT_SEPARATION = 'NO_PRODUCTION_ENVIRONMENT_SEPARATION';
export const PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN = 'PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN';

export type FoundationLifecycle =
  | 'NOT_SELECTED'
  | 'CONFIGURATION_REQUIRED'
  | 'CREDENTIALS_REQUIRED'
  | 'VERIFICATION_REQUIRED'
  | 'APPROVAL_REQUIRED'
  | 'READY_FOR_ACTIVATION'
  | 'ENABLED'
  | 'DISABLED'
  | 'EXTERNAL_GATED';

export type FoundationRailId =
  | 'PRODUCTION_ENVIRONMENT'
  | 'DEPLOYMENT_TARGET'
  | 'SECRETS_MANAGER'
  | 'PRODUCTION_DATABASE';

export type FoundationRailReport = {
  rail_id: FoundationRailId;
  label: string;
  lifecycle: FoundationLifecycle;
  provider: 'NOT_SELECTED' | string;
  configured: false;
  verified: false;
  approved: false;
  enabled: false;
  sandbox: 'SANDBOX_VERIFIED' | 'SANDBOX_ONLY' | 'ISOLATED';
  production: 'EXTERNAL_GATED' | 'PRODUCTION_NOT_CONFIGURED';
  configuration_readiness: 'MISSING' | 'PARTIAL' | 'READY';
  credentials_readiness: 'MISSING' | 'PARTIAL' | 'READY' | 'N/A';
  verification: 'MISSING' | 'SANDBOX_ONLY' | 'PRODUCTION_PENDING';
  blocker: string;
  blockers: string[];
  dependencies: string[];
  checklist: Array<{ id: string; label: string; status: 'MISSING' | 'PRESENT' | 'PENDING' | 'N/A' }>;
  next_action: string;
  notes: string[];
};

export type SecretReferenceContract = {
  key: string;
  rail: string;
  classification: 'SECRET_REFERENCE';
  value_in_source: false;
  value_in_admin_ui: false;
  value_in_customer_api: false;
};

export type WorkloadIdentitySlot = {
  identity: string;
  purpose: string;
  status: 'REQUIRED' | 'NOT_CONFIGURED';
  universal_admin_forbidden: true;
};

function resolveRepoRoot(): string {
  const candidates = [join(process.cwd(), '../..'), join(process.cwd(), '../../..'), process.cwd()];
  for (const root of candidates) {
    if (existsSync(join(root, 'pnpm-lock.yaml')) && existsSync(join(root, 'nx.json'))) return root;
  }
  return process.cwd();
}

export function buildSecretReferenceContracts(): SecretReferenceContract[] {
  const keys: Array<[string, string]> = [
    ['PSP_API_KEY', 'PSP'],
    ['PSP_WEBHOOK_SECRET', 'PSP'],
    ['OTP_PROVIDER_SECRET', 'OTP'],
    ['CARRIER_API_SECRET', 'CARRIER'],
    ['ERX_PRIVATE_KEY', 'ERX'],
    ['VIDEO_SIGNING_SECRET', 'VIDEO'],
    ['PACS_CREDENTIAL', 'PACS'],
    ['KYC_API_SECRET', 'KYC_KYB'],
    ['STORAGE_CREDENTIAL', 'PRIVATE_STORAGE'],
    ['KMS_REFERENCE', 'KMS'],
    ['BACKUP_CREDENTIAL', 'MANAGED_BACKUP'],
    ['APM_CREDENTIAL', 'APM'],
  ];
  return keys.map(([key, rail]) => ({
    key,
    rail,
    classification: 'SECRET_REFERENCE',
    value_in_source: false,
    value_in_admin_ui: false,
    value_in_customer_api: false,
  }));
}

export function buildWorkloadIdentityModel(): WorkloadIdentitySlot[] {
  return [
    {
      identity: 'application_runtime',
      purpose: 'Least-privilege app DB/redis/secrets access',
      status: 'NOT_CONFIGURED',
      universal_admin_forbidden: true,
    },
    {
      identity: 'deployment',
      purpose: 'Artifact push / release orchestration only',
      status: 'NOT_CONFIGURED',
      universal_admin_forbidden: true,
    },
    {
      identity: 'operator_admin',
      purpose: 'Human Admin control plane (RBAC)',
      status: 'REQUIRED',
      universal_admin_forbidden: true,
    },
    {
      identity: 'database',
      purpose: 'Server-side Postgres identity via secret ref',
      status: 'NOT_CONFIGURED',
      universal_admin_forbidden: true,
    },
    {
      identity: 'secrets_manager',
      purpose: 'Vault / secrets namespace access',
      status: 'NOT_CONFIGURED',
      universal_admin_forbidden: true,
    },
    {
      identity: 'backup_recovery',
      purpose: 'Managed backup / PITR / DR recovery (S96)',
      status: 'NOT_CONFIGURED',
      universal_admin_forbidden: true,
    },
    {
      identity: 'observability',
      purpose: 'APM / metrics / alerting credentials (S97)',
      status: 'NOT_CONFIGURED',
      universal_admin_forbidden: true,
    },
  ];
}

export function buildFoundationDependencyChain(): Array<{ from: string; to: string; reason: string }> {
  return [
    { from: 'PRODUCTION_ENVIRONMENT', to: 'SECRETS_MANAGER', reason: 'env identity before vault namespace' },
    { from: 'SECRETS_MANAGER', to: 'PRODUCTION_DATABASE', reason: 'DB credentials via secret refs' },
    { from: 'PRODUCTION_DATABASE', to: 'DEPLOYMENT_TARGET', reason: 'runtime DB before deploy cutover' },
    { from: 'DEPLOYMENT_TARGET', to: 'APPLICATION_DEPLOYMENT', reason: 'target before artifact rollout' },
    { from: 'APPLICATION_DEPLOYMENT', to: 'HEALTH_READINESS', reason: 'deployed process before probes' },
    { from: 'HEALTH_READINESS', to: 'OBSERVABILITY', reason: 'process health before APM/pager' },
    { from: 'OBSERVABILITY', to: 'EXTERNAL_PROVIDER_ACTIVATION', reason: 'foundation before PSP/OTP/etc' },
  ];
}

function envRail(): FoundationRailReport {
  const runtime = buildRuntimeProfile();
  const infraEnv = process.env['INFRASTRUCTURE_ENVIRONMENT']?.trim().toLowerCase();
  const isProdClaim = infraEnv === 'production' || infraEnv === 'prod' || infraEnv === 'live';
  return {
    rail_id: 'PRODUCTION_ENVIRONMENT',
    label: 'Production Environment',
    lifecycle: 'EXTERNAL_GATED',
    provider: 'NOT_SELECTED',
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    sandbox: 'ISOLATED',
    production: 'EXTERNAL_GATED',
    configuration_readiness: 'MISSING',
    credentials_readiness: 'N/A',
    verification: 'SANDBOX_ONLY',
    blocker: NO_PRODUCTION_ENVIRONMENT,
    blockers: [NO_PRODUCTION_ENVIRONMENT, NO_PRODUCTION_ENVIRONMENT_SEPARATION, PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN],
    dependencies: [],
    checklist: [
      { id: 'unique_environment_identifier', label: 'Unique environment identifier', status: 'PENDING' },
      { id: 'environment_type', label: 'Explicit environment type = PRODUCTION', status: 'MISSING' },
      { id: 'config_namespace', label: 'Production configuration namespace', status: 'MISSING' },
      { id: 'secrets_namespace', label: 'Production secrets namespace', status: 'MISSING' },
      { id: 'db_configuration', label: 'Production database configuration', status: 'MISSING' },
      { id: 'deployment_target', label: 'Production deployment target', status: 'MISSING' },
      { id: 'observability_configuration', label: 'Production observability configuration', status: 'MISSING' },
      { id: 'market_configuration', label: 'Production market configuration (policy-driven)', status: 'PENDING' },
      { id: 'no_sandbox_fallback', label: 'No silent sandbox fallback', status: 'PRESENT' },
    ],
    next_action:
      'Select and provision a real production environment identity distinct from DEVELOPMENT/SANDBOX/STAGING; do not invent cloud accounts.',
    notes: [
      `Current runtime environment label: ${runtime.environment}`,
      isProdClaim
        ? 'INFRASTRUCTURE_ENVIRONMENT claims production but foundation rails remain EXTERNAL_GATED without real target/vault/DB.'
        : 'Sandbox/dev runtime — production environment NOT_SELECTED.',
      'DEVELOPMENT ≠ SANDBOX ≠ STAGING ≠ PRODUCTION',
    ],
  };
}

function deploymentTargetRail(): FoundationRailReport {
  const deploy = evaluateProductionDeploymentFirstOnboarding();
  return {
    rail_id: 'DEPLOYMENT_TARGET',
    label: 'Production Deployment Target',
    lifecycle: 'EXTERNAL_GATED',
    provider: 'NOT_SELECTED',
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    configuration_readiness: 'MISSING',
    credentials_readiness: 'MISSING',
    verification: 'SANDBOX_ONLY',
    blocker: NO_PRODUCTION_DEPLOYMENT_TARGET,
    blockers: [NO_PRODUCTION_DEPLOYMENT_TARGET, ...(deploy.remaining_blockers.slice(0, 4) as string[])],
    dependencies: ['PRODUCTION_ENVIRONMENT', 'SECRETS_MANAGER', 'PRODUCTION_DATABASE'],
    checklist: [
      { id: 'target_selected', label: 'Target selected?', status: 'MISSING' },
      { id: 'runtime_platform', label: 'Runtime/platform', status: 'MISSING' },
      { id: 'region_location', label: 'Region/location if applicable', status: 'N/A' },
      { id: 'environment', label: 'Environment = production', status: 'MISSING' },
      { id: 'network_security', label: 'Network/security configuration', status: 'MISSING' },
      { id: 'deployment_credentials', label: 'Deployment credentials (presence only)', status: 'MISSING' },
      { id: 'artifact_capability', label: 'Artifact deployment capability', status: 'PENDING' },
      { id: 'health_endpoint', label: 'Health endpoint', status: 'PRESENT' },
      { id: 'readiness_endpoint', label: 'Readiness endpoint', status: 'PRESENT' },
      { id: 'rollback_capability', label: 'Rollback capability', status: 'PENDING' },
    ],
    next_action: deploy.next_action,
    notes: [
      'Docker API image + CI validate-only ≠ production deployment target',
      'No invented cloud provider',
      `Buildable=${String(deploy.buildable)} Deployable=${String(deploy.deployable)}`,
    ],
  };
}

function secretsManagerRail(): FoundationRailReport {
  const secrets = evaluateProductionSecretsEnvFirstOnboarding();
  return {
    rail_id: 'SECRETS_MANAGER',
    label: 'Production Secrets Manager',
    lifecycle: 'EXTERNAL_GATED',
    provider: 'NOT_SELECTED',
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    configuration_readiness: 'MISSING',
    credentials_readiness: 'MISSING',
    verification: 'SANDBOX_ONLY',
    blocker: NO_PRODUCTION_SECRETS_MANAGER,
    blockers: [NO_PRODUCTION_SECRETS_MANAGER, ...(secrets.remaining_blockers.slice(0, 4) as string[])],
    dependencies: ['PRODUCTION_ENVIRONMENT'],
    checklist: [
      { id: 'provider_selected', label: 'Provider selected?', status: 'MISSING' },
      { id: 'vault_namespace', label: 'Production vault/namespace configured?', status: 'MISSING' },
      { id: 'workload_identity', label: 'Workload identity configured?', status: 'MISSING' },
      { id: 'access_policy', label: 'Access policy configured?', status: 'MISSING' },
      { id: 'secret_references', label: 'Secret references configured?', status: 'PENDING' },
      { id: 'rotation_policy', label: 'Rotation policy configured?', status: 'MISSING' },
      { id: 'audit_logging', label: 'Audit logging configured?', status: 'MISSING' },
      { id: 'recovery_procedure', label: 'Recovery/access procedure documented?', status: 'PENDING' },
    ],
    next_action: secrets.next_action,
    notes: [
      'Secrets manager readiness ≠ secrets exist',
      'Never invent vault URL / access token / encryption key',
      'Applications consume references, not hardcoded values',
    ],
  };
}

function productionDatabaseRail(): FoundationRailReport {
  const root = resolveRepoRoot();
  const hasPrisma = existsSync(join(root, 'packages/database/prisma/schema.prisma'));
  return {
    rail_id: 'PRODUCTION_DATABASE',
    label: 'Production Database',
    lifecycle: 'EXTERNAL_GATED',
    provider: 'NOT_SELECTED',
    configured: false,
    verified: false,
    approved: false,
    enabled: false,
    sandbox: 'SANDBOX_VERIFIED',
    production: 'EXTERNAL_GATED',
    configuration_readiness: hasPrisma ? 'PARTIAL' : 'MISSING',
    credentials_readiness: 'MISSING',
    verification: 'SANDBOX_ONLY',
    blocker: NO_PRODUCTION_DATABASE,
    blockers: [NO_PRODUCTION_DATABASE, NO_PRODUCTION_ENVIRONMENT_SEPARATION],
    dependencies: ['PRODUCTION_ENVIRONMENT', 'SECRETS_MANAGER'],
    checklist: [
      { id: 'distinct_from_sandbox', label: 'Production DB distinct from sandbox', status: 'MISSING' },
      { id: 'server_side_only', label: 'Connection configuration server-side only', status: 'PRESENT' },
      { id: 'secret_managed_credentials', label: 'Credentials secret-managed', status: 'MISSING' },
      { id: 'tls_security', label: 'TLS/security requirements represented', status: 'PENDING' },
      { id: 'connection_pooling', label: 'Connection pooling configuration', status: 'PENDING' },
      { id: 'migration_policy', label: 'Migration policy explicit (forward-only)', status: 'PRESENT' },
      { id: 'backup_dependency', label: 'Backup dependency respected (S96)', status: 'PENDING' },
      { id: 'health_readiness', label: 'Health/readiness checks exist', status: 'PRESENT' },
      { id: 'no_sandbox_fallback', label: 'No sandbox DB fallback in production', status: 'PRESENT' },
    ],
    next_action:
      'Provision a real production Postgres distinct from sandbox; store credentials as secret refs; never copy sandbox/PHI data.',
    notes: [
      'Do not create a real production database in this sprint',
      'Do not connect to personal databases',
      'Prisma schema + migrate deploy contracts exist as SOFTWARE_READY only',
    ],
  };
}

export function evaluateProductionFoundationRails(): FoundationRailReport[] {
  return [envRail(), secretsManagerRail(), productionDatabaseRail(), deploymentTargetRail()];
}

export function validateProductionFoundationConfiguration() {
  const rails = evaluateProductionFoundationRails();
  const secret_references = buildSecretReferenceContracts();
  const workload_identities = buildWorkloadIdentityModel();
  const dependency_chain = buildFoundationDependencyChain();
  const environments = {
    DEVELOPMENT: 'ISOLATED',
    SANDBOX: 'ISOLATED',
    STAGING: 'EXTERNAL_GATED',
    PRODUCTION: 'EXTERNAL_GATED',
  } as const;

  const blockers = [
    NO_PRODUCTION_ENVIRONMENT,
    NO_PRODUCTION_SECRETS_MANAGER,
    NO_PRODUCTION_DATABASE,
    NO_PRODUCTION_DEPLOYMENT_TARGET,
    NO_PRODUCTION_ENVIRONMENT_SEPARATION,
    PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
  ];

  return {
    ready_for_activation: false,
    production_environment_enabled: false,
    production_deployment_target_enabled: false,
    production_secrets_manager_enabled: false,
    production_database_enabled: false,
    production_activation: 'EXTERNAL_GATED' as const,
    rails,
    secret_references,
    workload_identities,
    dependency_chain,
    environments,
    deployment_apps: [
      { app: 'api', track: 'PRODUCTION_WEB_API', status: 'BUILDABLE_NOT_DEPLOYED' },
      { app: 'web-customer', track: 'PRODUCTION_WEB', status: 'BUILDABLE_NOT_DEPLOYED' },
      { app: 'web-admin', track: 'PRODUCTION_WEB', status: 'BUILDABLE_NOT_DEPLOYED' },
      { app: 'web-vendor', track: 'PRODUCTION_WEB', status: 'BUILDABLE_NOT_DEPLOYED' },
      { app: 'web-doctor', track: 'PRODUCTION_WEB', status: 'BUILDABLE_NOT_DEPLOYED' },
      { app: 'web-lab', track: 'PRODUCTION_WEB', status: 'BUILDABLE_NOT_DEPLOYED' },
      { app: 'web-radiology', track: 'PRODUCTION_WEB', status: 'BUILDABLE_NOT_DEPLOYED' },
      { app: 'mobile', track: 'SEPARATE_NATIVE_TRACK', status: 'NOT_IN_SCOPE_S101' },
    ],
    secrets_exposed: false,
    fake_infrastructure_invented: false,
    blockers,
  };
}

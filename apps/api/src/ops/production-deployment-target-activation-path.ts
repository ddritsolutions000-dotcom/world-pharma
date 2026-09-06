/**
 * Sprint 145 — Real production deployment target activation path (software).
 * Composes S99/S112/S117/S118/S119 + S144 + S142 + S143.
 * Does NOT invent cloud accounts, CI credentials, domains, DBs, or deployment success.
 * NOT_CONFIGURED → CONFIGURED → VERIFIED → DEPLOYABLE → DEPLOYED (lifecycle reused).
 * SOFTWARE_COMPLETE ≠ DEPLOYABLE ≠ DEPLOYED ≠ ENABLED.
 */
import { Errors } from '../common/problem';
import { assertNoSecretLeak } from './secret-redaction';
import { readInfrastructureEnvironment, type InfraRuntimeEnvironment } from './infra-environment';
import {
  NO_PRODUCTION_DEPLOYMENT_TARGET,
  NO_PRODUCTION_RELEASE_PIPELINE,
  MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
  SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
  ROLLBACK_NOT_YET_PROVEN,
  evaluateMigrationReleaseSafety,
} from './production-deployment-requirements';
import {
  NO_PRODUCTION_DATABASE,
  NO_PRODUCTION_ENVIRONMENT,
  NO_PRODUCTION_SECRETS_MANAGER,
  PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
  type DeploymentTargetLifecycle,
} from './production-foundation-activation-preparation';
import {
  evaluateProductionDeploymentTargetActivation,
  evaluateFailClosedDeploymentCases,
  buildDeploymentTargetReferenceSlots,
  validateDeploymentTargetActivation,
  DEPLOYMENT_TARGET_ACTIVATION_AUTHORITATIVE,
} from './production-deployment-target-activation-contract';
import {
  evaluateDeploymentReleaseEngineeringProductionActivationPath,
  NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER,
  CLIENT_DEPLOYMENT_ACCESS_DENIED,
  DEPLOYMENT_CALLER_UNAUTHORIZED,
  FORGED_DEPLOYMENT_STATE_REJECTED,
  FORGED_ARTIFACT_IDENTITY_REJECTED,
  readArtifactIdentityPresence,
  evaluateRollbackAuthorization,
  buildSafeReleaseEvent,
  emitSafeReleaseObservabilityEvent,
  assertReleaseCallerAuthorized,
  type ReleaseCaller,
  type ArtifactIdentityPresence,
} from './deployment-release-engineering-production-activation-path';
import {
  secretsManagerRuntimeResolverStatus,
  presentSecretReference,
  type SecretReference,
} from './secrets-manager-runtime-resolver';
import { evaluateObservabilityApmMonitoringAlertingProductionActivationPath } from './observability-apm-monitoring-alerting-production-activation-path';

export const PRODUCTION_DEPLOYMENT_TARGET_ACTIVATION_PATH_AUTHORITATIVE =
  'PRODUCTION_DEPLOYMENT_TARGET_ACTIVATION_PATH_AUTHORITATIVE';

export const LOCALHOST_TARGET_BLOCKED_IN_PRODUCTION =
  'LOCALHOST_TARGET_BLOCKED_IN_PRODUCTION';
export const SANDBOX_TARGET_BLOCKED_IN_PRODUCTION =
  'SANDBOX_TARGET_BLOCKED_IN_PRODUCTION';
export const MOCK_DEPLOYMENT_ADAPTER_BLOCKED = 'MOCK_DEPLOYMENT_ADAPTER_BLOCKED';
export const PRODUCTION_TARGET_VALIDATION_BLOCKED =
  'PRODUCTION_TARGET_VALIDATION_BLOCKED';
export const ARTIFACT_IDENTITY_AMBIGUOUS = 'ARTIFACT_IDENTITY_AMBIGUOUS';
export const NO_PRODUCTION_DEPLOYMENT_ADAPTER = 'NO_PRODUCTION_DEPLOYMENT_ADAPTER';
export const LOCAL_VERIFICATION_NEQ_PRODUCTION = 'LOCAL_VERIFICATION_NEQ_PRODUCTION';
export const POST_DEPLOY_VERIFICATION_EXTERNAL_GATED =
  'POST_DEPLOY_VERIFICATION_EXTERNAL_GATED';

export {
  CLIENT_DEPLOYMENT_ACCESS_DENIED,
  DEPLOYMENT_CALLER_UNAUTHORIZED,
  FORGED_ARTIFACT_IDENTITY_REJECTED,
  FORGED_DEPLOYMENT_STATE_REJECTED,
  NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER,
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

export type DeploymentTargetSlotPresence = {
  id: string;
  label: string;
  env_key: string;
  reference_present: boolean;
  required_for_production: boolean;
  secret: boolean;
};

export function buildLiveDeploymentTargetSlots(): DeploymentTargetSlotPresence[] {
  const slot = (
    id: string,
    label: string,
    env_key: string,
    required: boolean,
    secret: boolean,
  ): DeploymentTargetSlotPresence => ({
    id,
    label,
    env_key,
    reference_present: envPresent(env_key),
    required_for_production: required,
    secret,
  });
  return [
    slot('deployment_provider', 'Deployment provider', 'DEPLOYMENT_PROVIDER', true, false),
    slot('deployment_target_ref', 'Deployment target reference', 'DEPLOYMENT_TARGET_REF', true, false),
    slot('environment_identity', 'Environment identity', 'PRODUCTION_ENVIRONMENT_ID_REF', true, false),
    slot('region_ref', 'Region / location reference', 'DEPLOYMENT_REGION_REF', false, false),
    slot('service_target_ref', 'Application / service target', 'RUNTIME_SERVICE_REF', true, false),
    slot('artifact_destination_ref', 'Artifact destination', 'ARTIFACT_DESTINATION_REF', true, false),
    slot('runtime_config_ref', 'Runtime configuration reference', 'RUNTIME_CONFIG_REF', true, false),
    slot('database_ref', 'Database reference', 'PRODUCTION_DATABASE_REF', true, false),
    slot('secrets_manager_ref', 'Secrets-manager reference', 'SECRETS_MANAGER_REF', true, true),
    slot('domain_ingress_ref', 'Domain / ingress reference', 'DOMAIN_INGRESS_REF', false, false),
    slot('health_endpoint_ref', 'Health endpoint reference', 'HEALTH_ENDPOINT_REF', true, false),
    slot('readiness_endpoint_ref', 'Readiness endpoint reference', 'READINESS_ENDPOINT_REF', true, false),
    slot('observability_ref', 'Observability reference', 'OBSERVABILITY_REF', true, false),
    slot('rollback_target_ref', 'Rollback target reference', 'ROLLBACK_TARGET_REF', true, false),
    slot('deployment_identity_ref', 'Deployment identity', 'DEPLOYMENT_IDENTITY_REF', true, false),
    slot('cicd_provider', 'CI/CD deploy provider', 'CICD_DEPLOY_PROVIDER', true, false),
    slot('deploy_credential_ref', 'Deploy credential secret reference', 'DEPLOY_CREDENTIAL_SECRET_REF', true, true),
  ];
}

export function isSandboxOrMockDeploymentProvider(code: string | null | undefined): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  return (
    upper === 'LOCAL' ||
    upper === 'LOCALHOST' ||
    upper === 'SANDBOX' ||
    upper === 'MOCK' ||
    upper === 'NULL' ||
    upper === 'CONSOLE' ||
    upper === 'DOCKER_COMPOSE' ||
    upper === 'DEV' ||
    upper.startsWith('MOCK_') ||
    upper.startsWith('SANDBOX_')
  );
}

export function readConfiguredProductionDeploymentProvider(): {
  selected: boolean;
  code: string | null;
  mock_rejected: boolean;
} {
  const raw = envValue('DEPLOYMENT_PROVIDER') ?? envValue('CICD_DEPLOY_PROVIDER');
  if (!raw) return { selected: false, code: null, mock_rejected: false };
  const code = raw.toUpperCase();
  if (isSandboxOrMockDeploymentProvider(code)) {
    return { selected: false, code, mock_rejected: true };
  }
  return { selected: true, code, mock_rejected: false };
}

export function assertProductionTargetHostSafe(targetRef: string): void {
  const lower = targetRef.trim().toLowerCase();
  if (!lower) {
    throw Errors.problem(
      400,
      NO_PRODUCTION_DEPLOYMENT_TARGET,
      'Deployment target missing',
      'A non-empty production deployment target reference is required.',
    );
  }
  if (
    lower === 'localhost' ||
    lower.includes('127.0.0.1') ||
    lower.includes('[::1]') ||
    lower.includes('0.0.0.0') ||
    /(^|[/.])localhost([/:]|$)/.test(lower)
  ) {
    throw Errors.problem(
      403,
      LOCALHOST_TARGET_BLOCKED_IN_PRODUCTION,
      'Localhost target blocked in production',
      'Localhost / loopback targets cannot be production deployment targets.',
    );
  }
  if (
    lower.includes('sandbox') ||
    lower.includes('mock') ||
    lower.includes('changeme') ||
    lower.includes('example.local') ||
    lower.includes('dev.local')
  ) {
    throw Errors.problem(
      403,
      SANDBOX_TARGET_BLOCKED_IN_PRODUCTION,
      'Sandbox target blocked in production',
      'Sandbox/mock/dev.local target references cannot be production deployment targets.',
    );
  }
}

export type DeploymentTargetVerificationCheck = {
  id: string;
  ok: boolean;
  blocker: string | null;
};

export function evaluateDeploymentTargetVerificationChecks(): {
  checks: DeploymentTargetVerificationCheck[];
  all_required_present: boolean;
  blockers: string[];
} {
  const slots = buildLiveDeploymentTargetSlots();
  const required = slots.filter((s) => s.required_for_production);
  const checks: DeploymentTargetVerificationCheck[] = required.map((s) => ({
    id: s.id,
    ok: s.reference_present,
    blocker: s.reference_present ? null : `MISSING_${s.env_key}`,
  }));
  const provider = readConfiguredProductionDeploymentProvider();
  checks.push({
    id: 'provider_selected',
    ok: provider.selected && !provider.mock_rejected,
    blocker: provider.mock_rejected
      ? MOCK_DEPLOYMENT_ADAPTER_BLOCKED
      : provider.selected
        ? null
        : NO_PRODUCTION_DEPLOYMENT_TARGET,
  });
  checks.push({
    id: 'adapter_registered',
    ok: registeredProductionDeploymentAdapter != null,
    blocker:
      registeredProductionDeploymentAdapter != null ? null : NO_PRODUCTION_DEPLOYMENT_ADAPTER,
  });
  const blockers = checks.filter((c) => !c.ok).map((c) => c.blocker!).filter(Boolean);
  return {
    checks,
    all_required_present: checks.every((c) => c.ok),
    blockers: [...new Set(blockers)],
  };
}

export type DeploymentArtifactRequirement = {
  identity: ArtifactIdentityPresence;
  acceptable: boolean;
  blocker: string | null;
};

export function evaluateArtifactIdentityForDeployment(): DeploymentArtifactRequirement {
  const identity = readArtifactIdentityPresence();
  const ambiguous =
    !identity.git_sha ||
    identity.git_sha === 'unknown' ||
    identity.git_sha === 'local' ||
    !identity.app_version;
  return {
    identity,
    acceptable: !ambiguous && identity.identity_present,
    blocker: ambiguous ? ARTIFACT_IDENTITY_AMBIGUOUS : null,
  };
}

export abstract class DeploymentProviderAdapter {
  abstract readonly name: string;
  abstract validateTarget(targetRef: string): Promise<void>;
  abstract validateCredentialReferences(): Promise<void>;
  abstract deployArtifact(_input: {
    artifact: ArtifactIdentityPresence;
    targetRef: string;
  }): Promise<{ deployment_id: string }>;
  abstract verifyDeployment(_deploymentId: string): Promise<{ verified: false }>;
  abstract checkHealth(_targetRef: string): Promise<{ status: 'EXTERNAL_GATED' }>;
  abstract checkReadiness(_targetRef: string): Promise<{ status: 'EXTERNAL_GATED' }>;
  abstract recordDeployment(_input: {
    deployment_id: string;
    state: DeploymentTargetLifecycle;
  }): Promise<void>;
  abstract identifyCurrentRelease(): Promise<{ release: null }>;
  abstract identifyPreviousKnownGoodRelease(): Promise<{ release: null }>;
  abstract rollback(_input: {
    known_good_ref: string;
    caller: ReleaseCaller;
  }): Promise<{ rolled_back: false }>;
}

export class FailClosedProductionDeploymentAdapter extends DeploymentProviderAdapter {
  readonly name = 'fail_closed_production';

  private blocked(op: string): never {
    throw Errors.problem(
      503,
      PRODUCTION_TARGET_VALIDATION_BLOCKED,
      'Production deployment adapter blocked',
      `${NO_PRODUCTION_DEPLOYMENT_ADAPTER}: ${op} unavailable. No fake deploy success. Live provider EXTERNAL_GATED.`,
    );
  }

  async validateTarget(targetRef: string): Promise<void> {
    assertProductionTargetHostSafe(targetRef);
    this.blocked('validateTarget');
  }
  async validateCredentialReferences(): Promise<void> {
    this.blocked('validateCredentialReferences');
  }
  async deployArtifact(): Promise<{ deployment_id: string }> {
    this.blocked('deployArtifact');
  }
  async verifyDeployment(): Promise<{ verified: false }> {
    this.blocked('verifyDeployment');
  }
  async checkHealth(): Promise<{ status: 'EXTERNAL_GATED' }> {
    this.blocked('checkHealth');
  }
  async checkReadiness(): Promise<{ status: 'EXTERNAL_GATED' }> {
    this.blocked('checkReadiness');
  }
  async recordDeployment(): Promise<void> {
    this.blocked('recordDeployment');
  }
  async identifyCurrentRelease(): Promise<{ release: null }> {
    return { release: null };
  }
  async identifyPreviousKnownGoodRelease(): Promise<{ release: null }> {
    return { release: null };
  }
  async rollback(): Promise<{ rolled_back: false }> {
    this.blocked('rollback');
  }
}

export class SandboxNoopDeploymentAdapter extends DeploymentProviderAdapter {
  readonly name = 'sandbox_noop';

  private ensureNotProduction(): void {
    if (readInfrastructureEnvironment() === 'production') {
      throw Errors.problem(
        503,
        SANDBOX_TARGET_BLOCKED_IN_PRODUCTION,
        'Sandbox deployment adapter blocked in production',
        'SandboxNoopDeploymentAdapter cannot operate when infrastructure environment is production.',
      );
    }
  }

  async validateTarget(targetRef: string): Promise<void> {
    this.ensureNotProduction();
    void targetRef;
  }
  async validateCredentialReferences(): Promise<void> {
    this.ensureNotProduction();
  }
  async deployArtifact(): Promise<{ deployment_id: string }> {
    this.ensureNotProduction();
    throw Errors.problem(
      403,
      LOCAL_VERIFICATION_NEQ_PRODUCTION,
      'Sandbox deploy is not production',
      'Sandbox noop adapter never reports production deployment success.',
    );
  }
  async verifyDeployment(): Promise<{ verified: false }> {
    this.ensureNotProduction();
    return { verified: false };
  }
  async checkHealth(): Promise<{ status: 'EXTERNAL_GATED' }> {
    this.ensureNotProduction();
    return { status: 'EXTERNAL_GATED' };
  }
  async checkReadiness(): Promise<{ status: 'EXTERNAL_GATED' }> {
    this.ensureNotProduction();
    return { status: 'EXTERNAL_GATED' };
  }
  async recordDeployment(): Promise<void> {
    this.ensureNotProduction();
  }
  async identifyCurrentRelease(): Promise<{ release: null }> {
    return { release: null };
  }
  async identifyPreviousKnownGoodRelease(): Promise<{ release: null }> {
    return { release: null };
  }
  async rollback(): Promise<{ rolled_back: false }> {
    this.ensureNotProduction();
    return { rolled_back: false };
  }
}

let registeredProductionDeploymentAdapter: DeploymentProviderAdapter | null = null;

export function registerProductionDeploymentAdapter(
  adapter: DeploymentProviderAdapter | null,
): void {
  registeredProductionDeploymentAdapter = adapter;
}

export function getRegisteredProductionDeploymentAdapter(): DeploymentProviderAdapter | null {
  return registeredProductionDeploymentAdapter;
}

export function selectDeploymentProviderAdapter(): DeploymentProviderAdapter {
  if (readInfrastructureEnvironment() === 'production') {
    return registeredProductionDeploymentAdapter ?? new FailClosedProductionDeploymentAdapter();
  }
  return new SandboxNoopDeploymentAdapter();
}

export type CicdDeployPipelineStage = {
  id: string;
  label: string;
  software_status: 'SOFTWARE_READY' | 'CONTRACT_DEFINED';
  production_status: 'VALIDATE_ONLY' | 'EXTERNAL_GATED' | 'NOT_CONFIGURED';
};

export function listCicdDeployPipelineStages(): CicdDeployPipelineStage[] {
  return [
    { id: 'SOURCE', label: 'Source', software_status: 'SOFTWARE_READY', production_status: 'VALIDATE_ONLY' },
    { id: 'BUILD', label: 'Build', software_status: 'SOFTWARE_READY', production_status: 'VALIDATE_ONLY' },
    { id: 'TEST', label: 'Test', software_status: 'SOFTWARE_READY', production_status: 'VALIDATE_ONLY' },
    { id: 'ARTIFACT', label: 'Artifact', software_status: 'SOFTWARE_READY', production_status: 'EXTERNAL_GATED' },
    { id: 'CONFIG_VALIDATION', label: 'Config validation', software_status: 'SOFTWARE_READY', production_status: 'EXTERNAL_GATED' },
    { id: 'MIGRATION_GATE', label: 'Migration gate', software_status: 'SOFTWARE_READY', production_status: 'EXTERNAL_GATED' },
    { id: 'DEPLOY', label: 'Deploy', software_status: 'CONTRACT_DEFINED', production_status: 'NOT_CONFIGURED' },
    { id: 'HEALTH_CHECK', label: 'Health check', software_status: 'SOFTWARE_READY', production_status: 'EXTERNAL_GATED' },
    { id: 'READINESS_CHECK', label: 'Readiness check', software_status: 'SOFTWARE_READY', production_status: 'EXTERNAL_GATED' },
    { id: 'RELEASE_EVIDENCE', label: 'Release evidence', software_status: 'CONTRACT_DEFINED', production_status: 'EXTERNAL_GATED' },
  ];
}

export type PostDeployVerificationStep = {
  step: number;
  id: string;
  label: string;
  production_status: 'EXTERNAL_GATED' | 'SOFTWARE_CONTRACT';
};

export function listPostDeployVerificationSequence(): PostDeployVerificationStep[] {
  return [
    { step: 1, id: 'deployment_acknowledged', label: 'Deployment acknowledged', production_status: 'EXTERNAL_GATED' },
    { step: 2, id: 'artifact_identity_verified', label: 'Artifact identity verified', production_status: 'SOFTWARE_CONTRACT' },
    { step: 3, id: 'application_startup_verified', label: 'Application startup verified', production_status: 'EXTERNAL_GATED' },
    { step: 4, id: 'health_verified', label: '/health verified', production_status: 'SOFTWARE_CONTRACT' },
    { step: 5, id: 'readiness_verified', label: '/health/ready verified', production_status: 'SOFTWARE_CONTRACT' },
    { step: 6, id: 'version_verified', label: '/health/version verified', production_status: 'SOFTWARE_CONTRACT' },
    { step: 7, id: 'critical_deps_verified', label: 'Critical dependency readiness verified', production_status: 'EXTERNAL_GATED' },
    { step: 8, id: 'release_evidence_recorded', label: 'Release evidence recorded', production_status: 'EXTERNAL_GATED' },
  ];
}

export function presentDeploymentSecretReferences(): ReturnType<typeof presentSecretReference>[] {
  const refs: SecretReference[] = [
    {
      ref_id: envValue('DEPLOY_CREDENTIAL_SECRET_REF') ?? '',
      purpose: 'deploy_credentials',
      environment:
        readInfrastructureEnvironment() === 'production' ? 'production' : 'sandbox',
      provider_service: 'deployment',
    },
    {
      ref_id: envValue('SECRETS_MANAGER_REF') ?? '',
      purpose: 'secrets_manager',
      environment:
        readInfrastructureEnvironment() === 'production' ? 'production' : 'sandbox',
      provider_service: 'secrets_manager',
    },
  ];
  return refs.filter((r) => r.ref_id.trim().length > 0).map(presentSecretReference);
}

export function deriveDeploymentTargetLifecycle(): {
  lifecycle: DeploymentTargetLifecycle;
  configured: boolean;
  verified: false;
  deployable: false;
  deployed: false;
} {
  const provider = readConfiguredProductionDeploymentProvider();
  const slots = buildLiveDeploymentTargetSlots();
  const requiredPresent = slots
    .filter((s) => s.required_for_production)
    .every((s) => s.reference_present);
  const configured = provider.selected && requiredPresent;
  return {
    lifecycle: 'NOT_CONFIGURED',
    configured,
    verified: false,
    deployable: false,
    deployed: false,
  };
}

export function assertProductionDeploymentTargetActivationAllowed(
  context: string,
  caller: ReleaseCaller,
): void {
  assertReleaseCallerAuthorized(caller);
  if (readInfrastructureEnvironment() !== 'production') return;
  const provider = readConfiguredProductionDeploymentProvider();
  if (provider.mock_rejected) {
    throw Errors.problem(
      503,
      MOCK_DEPLOYMENT_ADAPTER_BLOCKED,
      'Mock deployment provider blocked',
      `${context}: sandbox/mock/local deployment providers cannot activate production.`,
    );
  }
  const target = envValue('DEPLOYMENT_TARGET_REF');
  if (target) assertProductionTargetHostSafe(target);
  throw Errors.problem(
    503,
    PRODUCTION_TARGET_VALIDATION_BLOCKED,
    'Production deployment target activation blocked',
    `${context}: ${NO_PRODUCTION_DEPLOYMENT_TARGET} / ${NO_PRODUCTION_DEPLOYMENT_ADAPTER}. Software COMPLETE; live target EXTERNAL_GATED.`,
  );
}

export function rejectForgedTargetState(claimed: {
  lifecycle?: string;
  deployed?: boolean;
}): never {
  throw Errors.problem(
    403,
    FORGED_DEPLOYMENT_STATE_REJECTED,
    'Forged target state rejected',
    `Client/forged target claims ignored (lifecycle=${claimed.lifecycle ?? 'n/a'}, deployed=${String(claimed.deployed)}).`,
  );
}

export type ProductionDeploymentTargetActivationPathReport = {
  sprint: 145;
  authoritative_source: typeof PRODUCTION_DEPLOYMENT_TARGET_ACTIVATION_PATH_AUTHORITATIVE;
  s119_authoritative_retained: typeof DEPLOYMENT_TARGET_ACTIVATION_AUTHORITATIVE;
  parallel_deployment_state_machine_created: false;
  fake_infrastructure_invented: false;
  fake_ci_credentials_invented: false;
  production_deployment_claimed: false;
  secrets_manager_runtime_resolver: ReturnType<typeof secretsManagerRuntimeResolverStatus>;
  infrastructure_environment: InfraRuntimeEnvironment;
  environment_isolation: {
    development_neq_sandbox: true;
    sandbox_neq_staging: true;
    staging_neq_production: true;
    localhost_rejected_in_production: true;
    sandbox_target_rejected_in_production: true;
  };
  software_activation_path: 'COMPLETE';
  composed_foundations: {
    s99: 'REUSED';
    s112: 'REUSED';
    s117: 'REUSED';
    s118: 'REUSED';
    s119: 'COMPOSED';
    s144: 'COMPOSED';
    s142: 'COMPOSED';
    s143: 'COMPOSED';
  };
  lifecycle: DeploymentTargetLifecycle;
  configured: boolean;
  verified: false;
  deployable: false;
  deployed: false;
  production_enabled: false;
  provider: { selected: boolean; code: string | null; mock_rejected: boolean };
  adapter: {
    production_registered: boolean;
    selected: string;
    sandbox_noop_available: true;
  };
  configuration_slots: DeploymentTargetSlotPresence[];
  secret_references_presence: ReturnType<typeof presentDeploymentSecretReferences>;
  verification_checks: ReturnType<typeof evaluateDeploymentTargetVerificationChecks>;
  artifact: DeploymentArtifactRequirement;
  cicd_deploy_stages: CicdDeployPipelineStage[];
  cicd_provider: {
    configured: false;
    remaining_blocker: typeof NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER;
    validate_only_ci_remains_valid: true;
  };
  post_deploy_verification: PostDeployVerificationStep[];
  migration_gate: ReturnType<typeof evaluateMigrationReleaseSafety>;
  rollback: ReturnType<typeof evaluateRollbackAuthorization>;
  s119_snapshot: { sprint: number; remaining_blocker: string; lifecycle: string };
  s144_snapshot: {
    sprint: number;
    software_activation_path: string;
    actually_deployed: boolean;
  };
  s142_snapshot: { secrets_manager_runtime_resolver: string };
  s143_snapshot: {
    software_activation_path: string;
    production_observability_enabled: boolean;
  };
  s119_reference_slots: ReturnType<typeof buildDeploymentTargetReferenceSlots>;
  s119_fail_closed: ReturnType<typeof evaluateFailClosedDeploymentCases>;
  s119_validation: ReturnType<typeof validateDeploymentTargetActivation>;
  release_event_sample: ReturnType<typeof buildSafeReleaseEvent>;
  blockers: string[];
  remaining_blocker: typeof NO_PRODUCTION_DEPLOYMENT_TARGET;
  can_production_launch: 'NO';
  secrets_printed: false;
  phi_printed: false;
  tokens_printed: false;
  admin_summary: {
    production_deployment: 'NOT_CONFIGURED' | 'CONFIGURED' | 'EXTERNAL_GATED';
    software_state: 'SOFTWARE_COMPLETE';
    target_provider: string;
    target_state: DeploymentTargetLifecycle;
    environment: InfraRuntimeEnvironment;
    cicd_state: 'VALIDATE_ONLY' | 'EXTERNAL_GATED';
    artifact_state: string;
    configuration_state: 'MISSING' | 'PARTIAL' | 'PRESENT';
    database_state: string;
    secrets_state: string;
    observability_state: string;
    deployment_state: DeploymentTargetLifecycle;
    current_release: null;
    previous_known_good_release: null;
    blocker_reason: string;
    production_deployed: false;
    production_enabled: false;
  };
  message: string;
  correlation_id?: string;
  evaluated_at: string;
};

export function evaluateProductionDeploymentTargetActivationPath(input?: {
  correlation_id?: string;
}): ProductionDeploymentTargetActivationPathReport {
  const env = readInfrastructureEnvironment();
  const s119 = evaluateProductionDeploymentTargetActivation();
  const s144 = evaluateDeploymentReleaseEngineeringProductionActivationPath();
  const s143 = evaluateObservabilityApmMonitoringAlertingProductionActivationPath();
  const provider = readConfiguredProductionDeploymentProvider();
  const derived = deriveDeploymentTargetLifecycle();
  const verification = evaluateDeploymentTargetVerificationChecks();
  const artifact = evaluateArtifactIdentityForDeployment();
  const slots = buildLiveDeploymentTargetSlots();
  const rollback = evaluateRollbackAuthorization();
  const release_event_sample = buildSafeReleaseEvent({
    event_type: 'deployment_state',
    deployment_state: derived.lifecycle,
    correlation_id: input?.correlation_id,
  });
  void emitSafeReleaseObservabilityEvent(release_event_sample);

  const requiredCount = slots.filter((s) => s.required_for_production).length;
  const presentRequired = slots.filter((s) => s.required_for_production && s.reference_present).length;
  const configuration_state: 'MISSING' | 'PARTIAL' | 'PRESENT' =
    presentRequired === 0 ? 'MISSING' : presentRequired >= requiredCount ? 'PRESENT' : 'PARTIAL';

  const blockers = [
    NO_PRODUCTION_DEPLOYMENT_TARGET,
    NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER,
    NO_PRODUCTION_DEPLOYMENT_ADAPTER,
    NO_PRODUCTION_RELEASE_PIPELINE,
    NO_PRODUCTION_ENVIRONMENT,
    NO_PRODUCTION_SECRETS_MANAGER,
    NO_PRODUCTION_DATABASE,
    MIGRATION_PRODUCTION_CUTOVER_NOT_AUTHORIZED,
    SMOKE_TEST_PRODUCTION_NOT_AUTHORIZED,
    ROLLBACK_NOT_YET_PROVEN,
    PRODUCTION_SANDBOX_FALLBACK_FORBIDDEN,
    LOCAL_VERIFICATION_NEQ_PRODUCTION,
    POST_DEPLOY_VERIFICATION_EXTERNAL_GATED,
    ...verification.blockers,
  ];
  if (provider.mock_rejected) blockers.push(MOCK_DEPLOYMENT_ADAPTER_BLOCKED);
  if (artifact.blocker) blockers.push(artifact.blocker);

  return {
    sprint: 145,
    authoritative_source: PRODUCTION_DEPLOYMENT_TARGET_ACTIVATION_PATH_AUTHORITATIVE,
    s119_authoritative_retained: DEPLOYMENT_TARGET_ACTIVATION_AUTHORITATIVE,
    parallel_deployment_state_machine_created: false,
    fake_infrastructure_invented: false,
    fake_ci_credentials_invented: false,
    production_deployment_claimed: false,
    secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    infrastructure_environment: env,
    environment_isolation: {
      development_neq_sandbox: true,
      sandbox_neq_staging: true,
      staging_neq_production: true,
      localhost_rejected_in_production: true,
      sandbox_target_rejected_in_production: true,
    },
    software_activation_path: 'COMPLETE',
    composed_foundations: {
      s99: 'REUSED',
      s112: 'REUSED',
      s117: 'REUSED',
      s118: 'REUSED',
      s119: 'COMPOSED',
      s144: 'COMPOSED',
      s142: 'COMPOSED',
      s143: 'COMPOSED',
    },
    lifecycle: derived.lifecycle,
    configured: derived.configured,
    verified: false,
    deployable: false,
    deployed: false,
    production_enabled: false,
    provider: {
      selected: provider.selected,
      code: provider.code,
      mock_rejected: provider.mock_rejected,
    },
    adapter: {
      production_registered: registeredProductionDeploymentAdapter != null,
      selected: selectDeploymentProviderAdapter().name,
      sandbox_noop_available: true,
    },
    configuration_slots: slots,
    secret_references_presence: presentDeploymentSecretReferences(),
    verification_checks: verification,
    artifact,
    cicd_deploy_stages: listCicdDeployPipelineStages(),
    cicd_provider: {
      configured: false,
      remaining_blocker: NO_PRODUCTION_CI_CD_DEPLOY_PROVIDER,
      validate_only_ci_remains_valid: true,
    },
    post_deploy_verification: listPostDeployVerificationSequence(),
    migration_gate: evaluateMigrationReleaseSafety(),
    rollback,
    s119_snapshot: {
      sprint: s119.sprint,
      remaining_blocker: s119.remaining_blocker,
      lifecycle: String(s119.deployment_target?.lifecycle ?? 'NOT_CONFIGURED'),
    },
    s144_snapshot: {
      sprint: s144.sprint,
      software_activation_path: s144.software_activation_path,
      actually_deployed: s144.actually_deployed,
    },
    s142_snapshot: {
      secrets_manager_runtime_resolver: secretsManagerRuntimeResolverStatus(),
    },
    s143_snapshot: {
      software_activation_path: s143.software_activation_path,
      production_observability_enabled: s143.production_observability_enabled,
    },
    s119_reference_slots: buildDeploymentTargetReferenceSlots(),
    s119_fail_closed: evaluateFailClosedDeploymentCases(),
    s119_validation: validateDeploymentTargetActivation({}),
    release_event_sample,
    blockers: [...new Set(blockers)],
    remaining_blocker: NO_PRODUCTION_DEPLOYMENT_TARGET,
    can_production_launch: 'NO',
    secrets_printed: false,
    phi_printed: false,
    tokens_printed: false,
    admin_summary: {
      // Refs-only presence never advances past EXTERNAL_GATED without live verification.
      production_deployment: derived.configured ? 'EXTERNAL_GATED' : 'NOT_CONFIGURED',
      software_state: 'SOFTWARE_COMPLETE',
      target_provider: provider.selected ? (provider.code ?? 'NOT_SELECTED') : 'NOT_SELECTED',
      target_state: derived.lifecycle,
      environment: env,
      cicd_state: 'VALIDATE_ONLY',
      artifact_state:
        artifact.blocker ??
        `${artifact.identity.app_version}@${(artifact.identity.git_sha || 'unknown').slice(0, 12)}`,
      configuration_state,
      database_state: NO_PRODUCTION_DATABASE,
      secrets_state: NO_PRODUCTION_SECRETS_MANAGER,
      observability_state: s143.admin_summary.observability,
      deployment_state: derived.lifecycle,
      current_release: null,
      previous_known_good_release: null,
      blocker_reason: NO_PRODUCTION_DEPLOYMENT_TARGET,
      production_deployed: false,
      production_enabled: false,
    },
    message:
      'Software production deployment-target activation path COMPLETE. Composes S119 + S144 + S142/S143. Provider-neutral adapter fail-closed. CI validate-only remains valid. No real target/CI deploy provider configured. Localhost/sandbox targets rejected for production. SOFTWARE_COMPLETE ≠ DEPLOYED.',
    correlation_id: input?.correlation_id,
    evaluated_at: new Date().toISOString(),
  };
}

export function assertNoSecretLeakInTargetPayload(blob: string): boolean {
  return assertNoSecretLeak(blob);
}

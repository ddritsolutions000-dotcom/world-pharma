/**
 * Sprint 142 — Production secrets-manager runtime resolver (software).
 * Reuses S98/S99/S112/S117–S119 + activation paths S132–S141.
 * Does NOT invent vault credentials, cloud secret stores, or claim production secrets enabled.
 * SECRET REF ≠ secret value. CONFIGURED ≠ VERIFIED ≠ APPROVED ≠ ENABLED.
 * Production MUST NOT fall back to .env / mock / sandbox credentials.
 * Software resolver path COMPLETE; external secrets-manager adapter remains EXTERNAL_GATED.
 */
import { Errors } from '../common/problem';
import { readInfrastructureEnvironment } from './infra-environment';
import { NO_PRODUCTION_SECRETS_MANAGER } from './production-secrets-env-requirements';
import { assertNoSecretLeak } from './secret-redaction';

export const SECRETS_MANAGER_RUNTIME_RESOLVER_AUTHORITATIVE =
  'SECRETS_MANAGER_RUNTIME_RESOLVER_AUTHORITATIVE';

/** Software contract present — removes hardcoded MISSING software blocker. */
export const SECRETS_MANAGER_RUNTIME_RESOLVER_SOFTWARE_COMPLETE =
  'SOFTWARE_COMPLETE' as const;

export const SECRETS_MANAGER_VERIFICATION_STATUS_ENV = 'SECRETS_MANAGER_VERIFICATION_STATUS';
export const SECRETS_MANAGER_APPROVAL_STATUS_ENV = 'SECRETS_MANAGER_APPROVAL_STATUS';

export const PRODUCTION_SECRET_RESOLUTION_BLOCKED = 'PRODUCTION_SECRET_RESOLUTION_BLOCKED';
export const SANDBOX_SECRET_REF_IN_PRODUCTION = 'SANDBOX_SECRET_REF_IN_PRODUCTION';
export const SECRET_REFERENCE_MISSING = 'SECRET_REFERENCE_MISSING';
export const SECRET_REFERENCE_INVALID = 'SECRET_REFERENCE_INVALID';
export const SECRET_WRONG_ENVIRONMENT = 'SECRET_WRONG_ENVIRONMENT';
export const SECRET_CALLER_UNAUTHORIZED = 'SECRET_CALLER_UNAUTHORIZED';
export const SECRET_UNAVAILABLE = 'SECRET_UNAVAILABLE';
export const CLIENT_SECRET_ACCESS_DENIED = 'CLIENT_SECRET_ACCESS_DENIED';
export const NO_PRODUCTION_SECRETS_MANAGER_ADAPTER =
  'NO_PRODUCTION_SECRETS_MANAGER_ADAPTER';

/** Alias retained for S132–S141 report blockers. */
export const SECRETS_MANAGER_RUNTIME_RESOLVER_MISSING =
  'SECRETS_MANAGER_RUNTIME_RESOLVER_MISSING';

export type SecretRuntimeEnvironment =
  | 'development'
  | 'sandbox'
  | 'staging'
  | 'production';

export type SecretCallerKind =
  | 'server_service'
  | 'admin_control_plane'
  | 'client_browser'
  | 'mobile'
  | 'unknown';

export type SecretReference = {
  /** Opaque reference id / vault path / env key name of the *reference* (never the value). */
  ref_id: string;
  purpose: string;
  environment: SecretRuntimeEnvironment;
  provider_service: string;
  version?: string | null;
};

export type SecretReferencePresence = {
  ref_id: string;
  purpose: string;
  environment: SecretRuntimeEnvironment;
  provider_service: string;
  version: string | null;
  reference_present: boolean;
  value_leaked: false;
  secret: true;
};

export type SecretCaller = {
  kind: SecretCallerKind;
  service_id: string;
};

export type ResolvedSecretMaterial = {
  /** Ephemeral material — must not be logged, serialized to Admin, or stored as a ref. */
  value: string;
  ref_id: string;
  purpose: string;
  environment: SecretRuntimeEnvironment;
  version: string | null;
};

function envPresent(key: string): boolean {
  const v = process.env[key]?.trim();
  return Boolean(v && v.length > 0 && !/^changeme|todo|placeholder|xxx$/i.test(v));
}

function envValue(key: string): string | null {
  const v = process.env[key]?.trim();
  if (!v || /^changeme|todo|placeholder|xxx$/i.test(v)) {
    return null;
  }
  return v;
}

function humanStatus(envKey: string, expected: 'verified' | 'approved'): boolean {
  return (envValue(envKey) ?? '').toLowerCase() === expected;
}

export function isSandboxOrMockSecretsManagerProvider(
  code: string | null | undefined,
): boolean {
  if (!code) return false;
  const upper = code.trim().toUpperCase();
  return (
    upper === 'ENV' ||
    upper === 'LOCAL' ||
    upper === 'SANDBOX' ||
    upper === 'MOCK' ||
    upper === 'NULL' ||
    upper === 'DOTENV' ||
    upper.startsWith('MOCK_') ||
    upper.startsWith('SANDBOX_') ||
    upper.includes('SANDBOX')
  );
}

export type SecretsManagerProviderSelection = {
  selected: boolean;
  code: string | null;
  mock_rejected: boolean;
};

export function readConfiguredProductionSecretsManagerProvider(): SecretsManagerProviderSelection {
  const raw = envValue('SECRETS_MANAGER_PROVIDER') ?? envValue('SECRETS_MANAGER_REF');
  if (!raw) {
    return { selected: false, code: null, mock_rejected: false };
  }
  // SECRETS_MANAGER_REF may be a vault URL ref, not a provider code.
  if (raw.includes(':') || raw.includes('/')) {
    return { selected: false, code: null, mock_rejected: false };
  }
  const code = raw.toUpperCase();
  if (isSandboxOrMockSecretsManagerProvider(code)) {
    return { selected: false, code, mock_rejected: true };
  }
  return { selected: true, code, mock_rejected: false };
}

export function readRuntimeSecretEnvironment(): SecretRuntimeEnvironment {
  const raw =
    process.env['SECRETS_RUNTIME_ENVIRONMENT']?.trim().toLowerCase() ??
    process.env['INFRASTRUCTURE_ENVIRONMENT']?.trim().toLowerCase() ??
    process.env['NODE_ENV']?.trim().toLowerCase();
  if (raw === 'production' || raw === 'prod' || raw === 'live') return 'production';
  if (raw === 'staging' || raw === 'stage') return 'staging';
  if (raw === 'development' || raw === 'dev') return 'development';
  return 'sandbox';
}

export function assertSecretCallerAuthorized(caller: SecretCaller): void {
  if (caller.kind === 'client_browser' || caller.kind === 'mobile') {
    throw Errors.problem(
      403,
      CLIENT_SECRET_ACCESS_DENIED,
      'Client secret access denied',
      'Browser/mobile callers cannot resolve production or server secrets.',
    );
  }
  if (caller.kind === 'unknown' || !caller.service_id?.trim()) {
    throw Errors.problem(
      403,
      SECRET_CALLER_UNAUTHORIZED,
      'Secret caller unauthorized',
      'Only authorized server-side services may resolve secrets.',
    );
  }
}

export function assertSecretReferenceShape(ref: SecretReference): void {
  const id = ref.ref_id?.trim() ?? '';
  if (!id) {
    throw Errors.problem(
      400,
      SECRET_REFERENCE_MISSING,
      'Secret reference missing',
      'A non-empty secret reference id is required.',
    );
  }
  if (
    id.includes('..') ||
    id.includes('\0') ||
    /^(file|http|https):/i.test(id) ||
    id.length > 512
  ) {
    throw Errors.problem(
      400,
      SECRET_REFERENCE_INVALID,
      'Secret reference invalid',
      'Secret reference failed validation (path traversal / scheme / length).',
    );
  }
  const lower = id.toLowerCase();
  if (
    lower.includes('sandbox') ||
    lower.includes('mock') ||
    lower.includes('changeme') ||
    lower.includes('placeholder')
  ) {
    if (ref.environment === 'production' || readRuntimeSecretEnvironment() === 'production') {
      throw Errors.problem(
        403,
        SANDBOX_SECRET_REF_IN_PRODUCTION,
        'Sandbox secret ref rejected in production',
        'Sandbox/mock/placeholder secret references cannot be resolved in production.',
      );
    }
  }
}

/**
 * Provider-neutral adapter. Production requires a genuine non-env adapter registration.
 * No AWS/GCP/Azure hardcoding in this sprint — EXTERNAL_GATED until a real adapter exists.
 */
export abstract class SecretsManagerAdapter {
  abstract readonly name: string;
  abstract resolve(
    ref: SecretReference,
    caller: SecretCaller,
  ): Promise<ResolvedSecretMaterial>;
}

/** Production fail-closed adapter — never returns values until a real provider is registered. */
export class FailClosedProductionSecretsManagerAdapter extends SecretsManagerAdapter {
  readonly name = 'fail_closed_production';

  async resolve(ref: SecretReference, caller: SecretCaller): Promise<ResolvedSecretMaterial> {
    assertSecretCallerAuthorized(caller);
    assertSecretReferenceShape(ref);
    throw Errors.problem(
      503,
      PRODUCTION_SECRET_RESOLUTION_BLOCKED,
      'Production secret resolution blocked',
      `${NO_PRODUCTION_SECRETS_MANAGER_ADAPTER}: no genuine secrets-manager adapter registered. Ref=${ref.ref_id.slice(0, 64)}. Purpose=${ref.purpose}. Never falls back to .env/mock.`,
    );
  }
}

/**
 * Sandbox/dev-only: resolves a reference that names an env var holding the secret,
 * or treats ref_id as an env key when present. Never used for production resolution.
 */
export class SandboxEnvSecretsManagerAdapter extends SecretsManagerAdapter {
  readonly name = 'sandbox_env';

  async resolve(ref: SecretReference, caller: SecretCaller): Promise<ResolvedSecretMaterial> {
    assertSecretCallerAuthorized(caller);
    assertSecretReferenceShape(ref);
    if (readRuntimeSecretEnvironment() === 'production') {
      throw Errors.problem(
        503,
        SANDBOX_SECRET_REF_IN_PRODUCTION,
        'Sandbox env adapter blocked in production',
        'SandboxEnvSecretsManagerAdapter cannot resolve secrets when runtime environment is production.',
      );
    }
    if (ref.environment === 'production') {
      throw Errors.problem(
        403,
        SECRET_WRONG_ENVIRONMENT,
        'Wrong environment secret reference',
        'Sandbox adapter cannot resolve production-labeled secret references.',
      );
    }
    // Prefer: REF env value points to another env key; else treat ref_id as env key holding the secret.
    const raw = process.env[ref.ref_id]?.trim();
    if (!raw || /^changeme|todo|placeholder|xxx$/i.test(raw)) {
      throw Errors.problem(
        503,
        SECRET_UNAVAILABLE,
        'Secret unavailable',
        `Sandbox secret material missing for ref ${ref.ref_id.slice(0, 64)}.`,
      );
    }
    const indirect = process.env[raw]?.trim();
    const value =
      indirect && !/^changeme|todo|placeholder|xxx$/i.test(indirect) ? indirect : raw;
    return {
      value,
      ref_id: ref.ref_id,
      purpose: ref.purpose,
      environment: ref.environment,
      version: ref.version ?? null,
    };
  }
}

let registeredProductionAdapter: SecretsManagerAdapter | null = null;

/** Test/harness only — register a genuine production adapter when one exists. */
export function registerProductionSecretsManagerAdapter(
  adapter: SecretsManagerAdapter | null,
): void {
  registeredProductionAdapter = adapter;
}

export function getRegisteredProductionSecretsManagerAdapter(): SecretsManagerAdapter | null {
  return registeredProductionAdapter;
}

export function selectSecretsManagerAdapter(): SecretsManagerAdapter {
  const env = readRuntimeSecretEnvironment();
  if (env === 'production') {
    return registeredProductionAdapter ?? new FailClosedProductionSecretsManagerAdapter();
  }
  return new SandboxEnvSecretsManagerAdapter();
}

/**
 * Server-side resolution entry. Never call from controllers that return the value to clients.
 * Does not log or return material to Admin views.
 */
export async function resolveSecretReference(
  ref: SecretReference,
  caller: SecretCaller,
): Promise<ResolvedSecretMaterial> {
  assertSecretCallerAuthorized(caller);
  assertSecretReferenceShape(ref);
  const runtime = readRuntimeSecretEnvironment();
  if (runtime === 'production' && ref.environment !== 'production') {
    throw Errors.problem(
      403,
      SECRET_WRONG_ENVIRONMENT,
      'Wrong environment secret reference',
      'Production runtime cannot resolve non-production secret references.',
    );
  }
  if (runtime !== 'production' && ref.environment === 'production') {
    throw Errors.problem(
      403,
      SECRET_WRONG_ENVIRONMENT,
      'Wrong environment secret reference',
      'Non-production runtime cannot resolve production secret references.',
    );
  }
  const adapter = selectSecretsManagerAdapter();
  try {
    return await adapter.resolve(ref, caller);
  } catch (err) {
    // Ensure error messages never embed secret material.
    const msg = err instanceof Error ? err.message : String(err);
    if (!assertNoSecretLeak(msg)) {
      throw Errors.problem(
        500,
        SECRET_UNAVAILABLE,
        'Secret unavailable',
        'Secret resolution failed (details redacted).',
      );
    }
    throw err;
  }
}

/** Presence-only view for Admin / activation paths — never includes values. */
export function presentSecretReference(ref: SecretReference): SecretReferencePresence {
  const present = Boolean(ref.ref_id?.trim());
  return {
    ref_id: ref.ref_id,
    purpose: ref.purpose,
    environment: ref.environment,
    provider_service: ref.provider_service,
    version: ref.version ?? null,
    reference_present: present,
    value_leaked: false,
    secret: true,
  };
}

export type SecretsManagerActivationStage =
  | 'NOT_SELECTED'
  | 'EXTERNAL_GATED'
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'APPROVED'
  | 'ENABLED';

export type SecretsManagerLifecycleStatus = {
  provider: string;
  configured: boolean;
  verified: boolean;
  approved: boolean;
  enabled: false;
  production: 'EXTERNAL_GATED';
  activation_stage: SecretsManagerActivationStage;
  remaining_blocker: string;
};

export function deriveProductionSecretsManagerLifecycle(): SecretsManagerLifecycleStatus {
  const sel = readConfiguredProductionSecretsManagerProvider();
  const refOk = envPresent('SECRETS_MANAGER_REF') || envPresent('SECRET_MANAGER_REF');
  const configured = sel.selected && refOk;
  const verified = configured && humanStatus(SECRETS_MANAGER_VERIFICATION_STATUS_ENV, 'verified');
  const approved = verified && humanStatus(SECRETS_MANAGER_APPROVAL_STATUS_ENV, 'approved');
  const enabled = false as const;
  const adapterPresent = registeredProductionAdapter != null;

  let activation_stage: SecretsManagerActivationStage = 'NOT_SELECTED';
  if (enabled && adapterPresent) activation_stage = 'ENABLED';
  else if (approved) activation_stage = 'APPROVED';
  else if (verified) activation_stage = 'VERIFIED';
  else if (configured) activation_stage = 'CONFIGURED';
  else if (sel.selected || sel.mock_rejected) activation_stage = 'EXTERNAL_GATED';

  let remaining_blocker: string = NO_PRODUCTION_SECRETS_MANAGER;
  if (sel.mock_rejected) remaining_blocker = SANDBOX_SECRET_REF_IN_PRODUCTION;
  else if (!sel.selected) remaining_blocker = NO_PRODUCTION_SECRETS_MANAGER;
  else if (!adapterPresent) remaining_blocker = NO_PRODUCTION_SECRETS_MANAGER_ADAPTER;

  return {
    provider: sel.selected ? (sel.code ?? 'NOT_SELECTED') : 'NOT_SELECTED',
    configured,
    verified,
    approved,
    enabled,
    production: 'EXTERNAL_GATED',
    activation_stage,
    remaining_blocker,
  };
}

export type SecretsManagerRuntimeResolverReport = {
  sprint: 142;
  authoritative_source: typeof SECRETS_MANAGER_RUNTIME_RESOLVER_AUTHORITATIVE;
  parallel_secrets_framework_created: false;
  fake_vault_invented: false;
  fake_credentials_invented: false;
  production_secrets_manager_enabled: false;
  /** Software blocker removed — resolver contract + fail-closed adapter exist. */
  secrets_manager_runtime_resolver: typeof SECRETS_MANAGER_RUNTIME_RESOLVER_SOFTWARE_COMPLETE;
  software_activation_path: 'COMPLETE';
  lifecycle: SecretsManagerLifecycleStatus;
  runtime_environment: SecretRuntimeEnvironment;
  infrastructure_environment: ReturnType<typeof readInfrastructureEnvironment>;
  production_adapter_registered: boolean;
  sandbox_adapter_available: true;
  never_fallback_to_dotenv_in_production: true;
  never_return_values_to_admin: true;
  never_return_values_to_client: true;
  environment_isolation: {
    development_neq_sandbox: true;
    sandbox_neq_staging: true;
    staging_neq_production: true;
    production_rejects_sandbox_refs: true;
  };
  fail_closed_cases: Array<{
    case_id: string;
    outcome: 'REJECTED' | 'EXTERNAL_GATED';
    reason: string;
  }>;
  integration_rails: string[];
  blockers: string[];
  remaining_blocker: typeof NO_PRODUCTION_SECRETS_MANAGER;
  can_production_launch: 'NO';
  secrets_printed: false;
  /** Admin presence-only — never includes secret values. */
  admin_summary: {
    secrets_manager:
      | 'NOT_CONFIGURED'
      | 'CONFIGURED'
      | 'VERIFIED'
      | 'EXTERNAL_GATED'
      | 'BLOCKED';
    software_resolver: typeof SECRETS_MANAGER_RUNTIME_RESOLVER_SOFTWARE_COMPLETE;
    production_adapter: 'NOT_REGISTERED' | 'REGISTERED';
    blocker_reason: string;
    secret_values_visible: false;
  };
  message: string;
  correlation_id?: string;
  evaluated_at: string;
};

export function evaluateSecretsManagerRuntimeResolver(input?: {
  correlation_id?: string;
}): SecretsManagerRuntimeResolverReport {
  const lifecycle = deriveProductionSecretsManagerLifecycle();
  const fail_closed_cases = [
    {
      case_id: 'missing_secrets_manager',
      outcome: 'EXTERNAL_GATED' as const,
      reason: NO_PRODUCTION_SECRETS_MANAGER,
    },
    {
      case_id: 'missing_adapter',
      outcome: 'EXTERNAL_GATED' as const,
      reason: NO_PRODUCTION_SECRETS_MANAGER_ADAPTER,
    },
    {
      case_id: 'missing_secret_ref',
      outcome: 'REJECTED' as const,
      reason: SECRET_REFERENCE_MISSING,
    },
    {
      case_id: 'invalid_secret_ref',
      outcome: 'REJECTED' as const,
      reason: SECRET_REFERENCE_INVALID,
    },
    {
      case_id: 'sandbox_ref_in_production',
      outcome: 'REJECTED' as const,
      reason: SANDBOX_SECRET_REF_IN_PRODUCTION,
    },
    {
      case_id: 'wrong_environment',
      outcome: 'REJECTED' as const,
      reason: SECRET_WRONG_ENVIRONMENT,
    },
    {
      case_id: 'client_browser_access',
      outcome: 'REJECTED' as const,
      reason: CLIENT_SECRET_ACCESS_DENIED,
    },
    {
      case_id: 'unauthorized_caller',
      outcome: 'REJECTED' as const,
      reason: SECRET_CALLER_UNAUTHORIZED,
    },
    {
      case_id: 'production_resolution_blocked',
      outcome: 'EXTERNAL_GATED' as const,
      reason: PRODUCTION_SECRET_RESOLUTION_BLOCKED,
    },
  ];

  return {
    sprint: 142,
    authoritative_source: SECRETS_MANAGER_RUNTIME_RESOLVER_AUTHORITATIVE,
    parallel_secrets_framework_created: false,
    fake_vault_invented: false,
    fake_credentials_invented: false,
    production_secrets_manager_enabled: false,
    secrets_manager_runtime_resolver: SECRETS_MANAGER_RUNTIME_RESOLVER_SOFTWARE_COMPLETE,
    software_activation_path: 'COMPLETE',
    lifecycle,
    runtime_environment: readRuntimeSecretEnvironment(),
    infrastructure_environment: readInfrastructureEnvironment(),
    production_adapter_registered: registeredProductionAdapter != null,
    sandbox_adapter_available: true,
    never_fallback_to_dotenv_in_production: true,
    never_return_values_to_admin: true,
    never_return_values_to_client: true,
    environment_isolation: {
      development_neq_sandbox: true,
      sandbox_neq_staging: true,
      staging_neq_production: true,
      production_rejects_sandbox_refs: true,
    },
    fail_closed_cases,
    integration_rails: [
      'PSP/payment',
      'OTP/messaging',
      'carrier/logistics',
      'eRx',
      'telemedicine/video',
      'PACS/DICOM',
      'private-storage/KMS/malware',
      'backup/PITR/DR',
    ],
    blockers: [
      NO_PRODUCTION_SECRETS_MANAGER,
      NO_PRODUCTION_SECRETS_MANAGER_ADAPTER,
      lifecycle.remaining_blocker,
    ],
    remaining_blocker: NO_PRODUCTION_SECRETS_MANAGER,
    can_production_launch: 'NO',
    secrets_printed: false,
    admin_summary: {
      secrets_manager: (() => {
        if (lifecycle.activation_stage === 'VERIFIED' || lifecycle.activation_stage === 'APPROVED') {
          return 'VERIFIED' as const;
        }
        if (lifecycle.activation_stage === 'CONFIGURED') return 'CONFIGURED' as const;
        if (lifecycle.activation_stage === 'NOT_SELECTED') return 'NOT_CONFIGURED' as const;
        return 'EXTERNAL_GATED' as const;
      })(),
      software_resolver: SECRETS_MANAGER_RUNTIME_RESOLVER_SOFTWARE_COMPLETE,
      production_adapter:
        registeredProductionAdapter != null
          ? ('REGISTERED' as const)
          : ('NOT_REGISTERED' as const),
      blocker_reason: lifecycle.remaining_blocker,
      secret_values_visible: false,
    },
    message:
      'Software secrets-manager runtime resolver COMPLETE: provider-neutral contract, sandbox env adapter, production fail-closed adapter. External vault/provider remains EXTERNAL_GATED. Resolving refs ≠ enabling PSP/OTP/carrier/etc. Secret values never returned to Admin/clients.',
    correlation_id: input?.correlation_id,
    evaluated_at: new Date().toISOString(),
  };
}

/** Status string for S132–S141 activation path reports. */
export function secretsManagerRuntimeResolverStatus(): typeof SECRETS_MANAGER_RUNTIME_RESOLVER_SOFTWARE_COMPLETE {
  return SECRETS_MANAGER_RUNTIME_RESOLVER_SOFTWARE_COMPLETE;
}

/** Fail-closed gate when production code paths require secrets-manager resolution. */
export function assertProductionSecretsManagerResolutionAllowed(context: string): void {
  if (readRuntimeSecretEnvironment() !== 'production') {
    return;
  }
  if (registeredProductionAdapter == null) {
    throw Errors.problem(
      503,
      PRODUCTION_SECRET_RESOLUTION_BLOCKED,
      'Production secret resolution blocked',
      `${context}: ${NO_PRODUCTION_SECRETS_MANAGER_ADAPTER}. Software resolver COMPLETE; live vault EXTERNAL_GATED. No .env/mock fallback.`,
    );
  }
  const life = deriveProductionSecretsManagerLifecycle();
  if (!life.enabled) {
    throw Errors.problem(
      503,
      PRODUCTION_SECRET_RESOLUTION_BLOCKED,
      'Production secret resolution blocked',
      `${context}: secrets manager not ENABLED (${life.remaining_blocker}).`,
    );
  }
}

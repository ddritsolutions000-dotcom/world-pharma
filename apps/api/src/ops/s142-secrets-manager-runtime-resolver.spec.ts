/**
 * Sprint 142 — Production secrets-manager runtime resolver (unit).
 * No invented vault credentials / no secret values in assertions beyond placeholders.
 */
import { ProblemException } from '../common/problem';
import { NO_PRODUCTION_SECRETS_MANAGER } from './production-secrets-env-requirements';
import { assertNoSecretLeak } from './secret-redaction';
import {
  CLIENT_SECRET_ACCESS_DENIED,
  FailClosedProductionSecretsManagerAdapter,
  NO_PRODUCTION_SECRETS_MANAGER_ADAPTER,
  PRODUCTION_SECRET_RESOLUTION_BLOCKED,
  SANDBOX_SECRET_REF_IN_PRODUCTION,
  SECRET_CALLER_UNAUTHORIZED,
  SECRET_REFERENCE_INVALID,
  SECRET_REFERENCE_MISSING,
  SECRET_UNAVAILABLE,
  SECRET_WRONG_ENVIRONMENT,
  SECRETS_MANAGER_RUNTIME_RESOLVER_AUTHORITATIVE,
  SECRETS_MANAGER_RUNTIME_RESOLVER_SOFTWARE_COMPLETE,
  SandboxEnvSecretsManagerAdapter,
  assertProductionSecretsManagerResolutionAllowed,
  assertSecretCallerAuthorized,
  assertSecretReferenceShape,
  evaluateSecretsManagerRuntimeResolver,
  presentSecretReference,
  registerProductionSecretsManagerAdapter,
  resolveSecretReference,
  secretsManagerRuntimeResolverStatus,
  type SecretCaller,
  type SecretReference,
} from './secrets-manager-runtime-resolver';
import { evaluatePspPaymentProductionActivationPath } from '../payment/psp-payment-production-activation-path';
import { evaluateOtpMessagingProductionActivationPath } from '../identity/otp-messaging-production-activation-path';
import { evaluateCarrierLogisticsProductionActivationPath } from '../logistics/carrier-logistics-production-activation-path';
import { evaluateErxProductionActivationPath } from '../clinical/erx-production-activation-path';
import { evaluateVideoProductionActivationPath } from '../clinical/video-production-activation-path';
import { evaluatePacsProductionActivationPath } from '../radiology/pacs-production-activation-path';
import { evaluatePrivateStorageKmsMalwareProductionActivationPath } from './private-storage-kms-malware-production-activation-path';

const serverCaller: SecretCaller = {
  kind: 'server_service',
  service_id: 's142-test-service',
};

function productionRef(overrides?: Partial<SecretReference>): SecretReference {
  return {
    ref_id: 'vault/prod/psp/api_key_ref',
    purpose: 'psp_api_key',
    environment: 'production',
    provider_service: 'psp',
    version: '1',
    ...overrides,
  };
}

describe('S142 secrets-manager runtime resolver', () => {
  afterEach(() => {
    registerProductionSecretsManagerAdapter(null);
    delete process.env.SECRETS_RUNTIME_ENVIRONMENT;
    delete process.env.INFRASTRUCTURE_ENVIRONMENT;
    delete process.env.SECRETS_MANAGER_PROVIDER;
    delete process.env.SECRETS_MANAGER_REF;
    delete process.env.SECRET_MANAGER_REF;
    delete process.env.SECRETS_MANAGER_VERIFICATION_STATUS;
    delete process.env.SECRETS_MANAGER_APPROVAL_STATUS;
  });

  it('reports SOFTWARE_COMPLETE / EXTERNAL_GATED / no values / no fake vault', () => {
    const report = evaluateSecretsManagerRuntimeResolver();
    expect(report.sprint).toBe(142);
    expect(report.authoritative_source).toBe(SECRETS_MANAGER_RUNTIME_RESOLVER_AUTHORITATIVE);
    expect(report.secrets_manager_runtime_resolver).toBe(
      SECRETS_MANAGER_RUNTIME_RESOLVER_SOFTWARE_COMPLETE,
    );
    expect(secretsManagerRuntimeResolverStatus()).toBe('SOFTWARE_COMPLETE');
    expect(report.software_activation_path).toBe('COMPLETE');
    expect(report.production_secrets_manager_enabled).toBe(false);
    expect(report.fake_vault_invented).toBe(false);
    expect(report.fake_credentials_invented).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_SECRETS_MANAGER);
    expect(report.admin_summary.secret_values_visible).toBe(false);
    expect(report.admin_summary.software_resolver).toBe('SOFTWARE_COMPLETE');
    expect(report.secrets_printed).toBe(false);
    expect(assertNoSecretLeak(JSON.stringify(report))).toBe(true);
  });

  it('enforces environment isolation labels', () => {
    const report = evaluateSecretsManagerRuntimeResolver();
    expect(report.environment_isolation.development_neq_sandbox).toBe(true);
    expect(report.environment_isolation.sandbox_neq_staging).toBe(true);
    expect(report.environment_isolation.staging_neq_production).toBe(true);
    expect(report.environment_isolation.production_rejects_sandbox_refs).toBe(true);
  });

  it('fail-closed: missing / invalid / sandbox refs + unauthorized callers', async () => {
    await expect(
      resolveSecretReference(
        productionRef({ ref_id: '' }),
        serverCaller,
      ),
    ).rejects.toMatchObject({ code: SECRET_REFERENCE_MISSING });

    await expect(
      resolveSecretReference(
        productionRef({ ref_id: '../etc/passwd' }),
        serverCaller,
      ),
    ).rejects.toMatchObject({ code: SECRET_REFERENCE_INVALID });

    process.env.SECRETS_RUNTIME_ENVIRONMENT = 'production';
    await expect(
      resolveSecretReference(
        productionRef({ ref_id: 'sandbox/mock/key', environment: 'production' }),
        serverCaller,
      ),
    ).rejects.toMatchObject({ code: SANDBOX_SECRET_REF_IN_PRODUCTION });

    expect(() =>
      assertSecretCallerAuthorized({ kind: 'client_browser', service_id: 'browser' }),
    ).toThrow(ProblemException);
    try {
      assertSecretCallerAuthorized({ kind: 'client_browser', service_id: 'browser' });
    } catch (err) {
      expect((err as ProblemException).code).toBe(CLIENT_SECRET_ACCESS_DENIED);
    }

    expect(() =>
      assertSecretCallerAuthorized({ kind: 'unknown', service_id: '' }),
    ).toThrow(ProblemException);
    try {
      assertSecretCallerAuthorized({ kind: 'unknown', service_id: '' });
    } catch (err) {
      expect((err as ProblemException).code).toBe(SECRET_CALLER_UNAUTHORIZED);
    }
  });

  it('fail-closed: wrong environment + production without adapter', async () => {
    process.env.SECRETS_RUNTIME_ENVIRONMENT = 'production';
    await expect(
      resolveSecretReference(
        productionRef({ environment: 'sandbox' }),
        serverCaller,
      ),
    ).rejects.toMatchObject({ code: SECRET_WRONG_ENVIRONMENT });

    await expect(
      resolveSecretReference(productionRef(), serverCaller),
    ).rejects.toMatchObject({ code: PRODUCTION_SECRET_RESOLUTION_BLOCKED });

    expect(() => assertProductionSecretsManagerResolutionAllowed('s142')).toThrow(
      ProblemException,
    );
    try {
      assertProductionSecretsManagerResolutionAllowed('s142');
    } catch (err) {
      expect((err as ProblemException).code).toBe(PRODUCTION_SECRET_RESOLUTION_BLOCKED);
      const msg = String((err as ProblemException).message ?? '') + JSON.stringify(err);
      expect(assertNoSecretLeak(msg)).toBe(true);
    }
  });

  it('sandbox adapter resolves env-backed refs; never in production', async () => {
    process.env.SECRETS_RUNTIME_ENVIRONMENT = 'sandbox';
    process.env.S142_SANDBOX_TEST_SECRET = 'sandbox-only-test-value';
    const adapter = new SandboxEnvSecretsManagerAdapter();
    const material = await adapter.resolve(
      {
        ref_id: 'S142_SANDBOX_TEST_SECRET',
        purpose: 'unit_test',
        environment: 'sandbox',
        provider_service: 'test',
      },
      serverCaller,
    );
    expect(material.value).toBe('sandbox-only-test-value');
    expect(presentSecretReference({
      ref_id: 'S142_SANDBOX_TEST_SECRET',
      purpose: 'unit_test',
      environment: 'sandbox',
      provider_service: 'test',
    }).value_leaked).toBe(false);

    process.env.SECRETS_RUNTIME_ENVIRONMENT = 'production';
    await expect(
      adapter.resolve(
        {
          ref_id: 'S142_SANDBOX_TEST_SECRET',
          purpose: 'unit_test',
          environment: 'sandbox',
          provider_service: 'test',
        },
        serverCaller,
      ),
    ).rejects.toMatchObject({ code: SANDBOX_SECRET_REF_IN_PRODUCTION });

    delete process.env.S142_SANDBOX_TEST_SECRET;
  });

  it('fail-closed production adapter never returns values', async () => {
    const adapter = new FailClosedProductionSecretsManagerAdapter();
    await expect(
      adapter.resolve(productionRef(), serverCaller),
    ).rejects.toMatchObject({ code: PRODUCTION_SECRET_RESOLUTION_BLOCKED });
  });

  it('presence view never includes secret values', () => {
    const presence = presentSecretReference(productionRef());
    expect(presence.reference_present).toBe(true);
    expect(presence.value_leaked).toBe(false);
    expect(JSON.stringify(presence)).not.toMatch(/sk_live_|whsec_|BEGIN PRIVATE KEY/i);
    expect(assertNoSecretLeak(JSON.stringify(presence))).toBe(true);
    expect(Object.keys(presence)).not.toContain('value');
  });

  it('wires SOFTWARE_COMPLETE into S132–S140 activation paths', () => {
    const paths = [
      evaluatePspPaymentProductionActivationPath(),
      evaluateOtpMessagingProductionActivationPath(),
      evaluateCarrierLogisticsProductionActivationPath(),
      evaluateErxProductionActivationPath(),
      evaluateVideoProductionActivationPath(),
      evaluatePacsProductionActivationPath(),
      evaluatePrivateStorageKmsMalwareProductionActivationPath(),
    ];
    for (const p of paths) {
      expect(p.secrets_manager_runtime_resolver).toBe('SOFTWARE_COMPLETE');
      expect(assertNoSecretLeak(JSON.stringify(p))).toBe(true);
    }
  });

  it('admin summary never enables production secrets manager', () => {
    process.env.SECRETS_MANAGER_PROVIDER = 'HASHICORP_VAULT';
    process.env.SECRETS_MANAGER_REF = 'vault://world-pharma/prod';
    process.env.SECRETS_MANAGER_VERIFICATION_STATUS = 'verified';
    process.env.SECRETS_MANAGER_APPROVAL_STATUS = 'approved';
    const report = evaluateSecretsManagerRuntimeResolver();
    expect(report.lifecycle.configured).toBe(true);
    expect(report.lifecycle.verified).toBe(true);
    expect(report.lifecycle.approved).toBe(true);
    expect(report.lifecycle.enabled).toBe(false);
    expect(report.production_secrets_manager_enabled).toBe(false);
    expect(report.admin_summary.secrets_manager).toBe('VERIFIED');
    expect(report.lifecycle.remaining_blocker).toBe(NO_PRODUCTION_SECRETS_MANAGER_ADAPTER);
  });

  it('sandbox missing secret fails closed without leaking', async () => {
    process.env.SECRETS_RUNTIME_ENVIRONMENT = 'sandbox';
    await expect(
      resolveSecretReference(
        {
          ref_id: 'S142_MISSING_ENV_KEY_XYZ',
          purpose: 'unit_test',
          environment: 'sandbox',
          provider_service: 'test',
        },
        serverCaller,
      ),
    ).rejects.toMatchObject({ code: SECRET_UNAVAILABLE });
  });

  it('assertSecretReferenceShape rejects empty refs', () => {
    expect(() =>
      assertSecretReferenceShape(productionRef({ ref_id: '   ' })),
    ).toThrow(ProblemException);
  });
});

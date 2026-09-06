/**
 * Sprint 78 — eRx / electronic prescribing activation readiness (no fake live provider).
 */
import {
  NO_PRODUCTION_CLINICAL_ADAPTER,
  NO_PRODUCTION_ERX_PROVIDER,
  buildErxSubmissionMachine,
  buildPrescriptionLifecycleMachine,
  evaluateErxEnablementGuard,
  evaluateErxFirstOnboarding,
  isMockOrNullErxProvider,
  listErxLegalClinicalGateItems,
  validateErxConfiguration,
} from './erx-first-onboarding';
import { configuredErxRuntimeProvider } from './erx.config';
import {
  isLiveHealthcareEnabled,
  readHealthcareEnvironment,
} from '../healthcare/healthcare-environment';
import { evaluateProductionHealthcareAvailable } from '../healthcare/production-healthcare-gate';
import { CountryProductionLifecycle, ProductionDependencyStatus } from '@prisma/client';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';

describe('S78 eRx availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_ERX_PROVIDER', () => {
    const report = evaluateErxFirstOnboarding();
    expect(report.sprint).toBeGreaterThanOrEqual(78);
    expect([68, 78]).toContain(report.foundation_sprint);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.real_erx_available).toBe(false);
    expect(report.configured).toBe(false);
    expect(report.enabled).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.transmission).toBe('SANDBOX_ONLY');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_ERX_PROVIDER);
    expect(report.related_clinical_blocker).toBe(NO_PRODUCTION_CLINICAL_ADAPTER);
    expect(report.internal_vs_legal).toBe('INTERNAL_RECORD_SEPARATE_FROM_LEGAL_TRANSMISSION');
    expect(report.fake_provider_invented).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.native_android).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.native_ios).toBe('DEVICE_NOT_AVAILABLE');
  });
});

describe('S78 prescription + submission machines', () => {
  it('keeps internal Rx separate from legal transmission', () => {
    const rx = buildPrescriptionLifecycleMachine();
    expect(rx.success_path).toContain('DRAFT');
    expect(rx.success_path).toContain('ISSUED');
    expect(rx.idempotent_submission).toBe(true);
    expect(rx.terminal_overwrite_forbidden).toBe(true);

    const sub = buildErxSubmissionMachine();
    expect(sub.never_claims_legal_without_provider).toBe(true);
    expect(sub.statuses).toContain('PENDING');
  });
});

describe('S78 permissions + observability', () => {
  it('documents scoped permissions and no-PHI logging', () => {
    const report = evaluateErxFirstOnboarding();
    expect(report.permission_model.tenant_isolation).toBe(true);
    expect(report.permission_model.admin_activation_oversight_not_universal_phi).toBe(true);
    expect(report.observability.no_phi_in_logs).toBe(true);
    expect(report.observability.not_selected_suppresses_false_outage).toBe(true);
    expect(report.country_support).toBe('POLICY_DRIVEN');
    expect(report.controlled_substances).toBe('LEGAL_GATED');
  });
});

describe('S78 enablement guard', () => {
  it('never enables without non-mock adapter', () => {
    const guard = evaluateErxEnablementGuard({
      nonMockAdapterRegistered: false,
      healthcareEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      legalGateClear: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(false);
  });

  it('requires full checklist including country policy', () => {
    const guard = evaluateErxEnablementGuard({
      nonMockAdapterRegistered: true,
      healthcareEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      legalGateClear: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
      countryPolicyConfigured: true,
    });
    expect(guard.can_enable).toBe(true);
  });

  it('blocks when country policy missing', () => {
    const guard = evaluateErxEnablementGuard({
      nonMockAdapterRegistered: true,
      healthcareEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      legalGateClear: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
      countryPolicyConfigured: false,
    });
    expect(guard.can_enable).toBe(false);
  });
});

describe('S78 configuration validator', () => {
  const base = {
    providerSelected: true,
    nonMockAdapterRegistered: true,
    healthcareEnvironment: 'production' as const,
    liveEnabled: false,
    humanApproved: false,
    credentialsPresent: true,
    accountIdentifierPresent: true,
    endpointConfigured: true,
    capabilityConfigured: true,
    countrySupportConfigured: true,
    webhookOrCallbackConfigured: true,
    legalClinicalConfigured: true,
  };

  it('NOT_SELECTED when provider not chosen', () => {
    expect(validateErxConfiguration({ ...base, providerSelected: false })).toBe('NOT_SELECTED');
  });

  it('credentials alone never ENABLED', () => {
    expect(validateErxConfiguration({ ...base, humanApproved: true, liveEnabled: true })).toBe(
      'APPROVED',
    );
  });
});

describe('S78 sandbox/production fail-closed', () => {
  const prev = {
    env: process.env['HEALTHCARE_ENVIRONMENT'],
    live: process.env['HEALTHCARE_LIVE_ENABLED'],
    erx: process.env['ERX_PROVIDER'],
  };

  afterEach(() => {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('HEALTHCARE_ENVIRONMENT', prev.env);
    restore('HEALTHCARE_LIVE_ENABLED', prev.live);
    restore('ERX_PROVIDER', prev.erx);
  });

  it('treats sandbox/null as mock; production gate never opens without live adapter', async () => {
    expect(isMockOrNullErxProvider('sandbox')).toBe(true);
    process.env['ERX_PROVIDER'] = 'sandbox';
    expect(configuredErxRuntimeProvider()).toBe('sandbox');
    process.env['HEALTHCARE_ENVIRONMENT'] = 'production';
    process.env['HEALTHCARE_LIVE_ENABLED'] = 'true';
    expect(readHealthcareEnvironment()).toBe('production');
    expect(isLiveHealthcareEnabled()).toBe(true);
    const prisma = {
      country: {
        findUnique: async () => ({
          id: 'c1',
          isoAlpha2: 'AE',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        }),
      },
      productionDependency: {
        findMany: async () => [
          {
            dependencyType: 'ERX_PROVIDER',
            status: ProductionDependencyStatus.VERIFIED,
            externalGated: false,
            configReference: 'vault:erx',
          },
        ],
        findFirst: async () => ({
          dependencyType: 'ERX_PROVIDER',
          status: ProductionDependencyStatus.VERIFIED,
          externalGated: false,
          configReference: 'vault:erx',
        }),
      },
    } as never;
    const result = await evaluateProductionHealthcareAvailable(prisma, {
      countryCode: 'AE',
      kind: 'DOCTOR',
    });
    expect(result.available).toBe(false);
    expect(result.blockers).toContain(NO_PRODUCTION_CLINICAL_ADAPTER);
    expect(result.never_fallback_to_sandbox_adapter).toBe(true);
  });
});

describe('S78 legal gate + globalization', () => {
  it('legal items EXTERNAL_GATED; no hardcoded market currency/phone', () => {
    const items = listErxLegalClinicalGateItems();
    expect(items.every((i) => i.status === 'EXTERNAL_GATED' || i.status === 'BLOCKED')).toBe(true);
    const blob = JSON.stringify(evaluateErxFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/patient_name|ssn|mrn/i);
  });

  it('ERX contract remains NOT_SELECTED', () => {
    const row = evaluateProviderActivation(getProviderActivationContract('ERX'));
    expect(row.provider_name).toBe('NOT_SELECTED');
    expect(row.enabled).toBe(false);
  });
});

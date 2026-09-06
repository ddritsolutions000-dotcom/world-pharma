/**
 * Sprint 68 — eRx first onboarding (no fake live clinical transmission).
 */
import {
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

describe('S68 eRx availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — no real eRx provider', () => {
    const report = evaluateErxFirstOnboarding();
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.real_erx_available).toBe(false);
    expect(report.configured).toBe(false);
    expect(report.verified).toBe(false);
    expect(report.approved).toBe(false);
    expect(report.enabled).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.transmission).toBe('SANDBOX_ONLY');
    expect(report.validation_status).toBe('NOT_SELECTED');
    expect(report.legal_clinical_gate).toBe('EXTERNAL_GATED');
    expect(report.controlled_substances).toBe('LEGAL_GATED');
    expect(report.internal_vs_legal).toBe('INTERNAL_RECORD_SEPARATE_FROM_LEGAL_TRANSMISSION');
    expect(report.secrets_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.remaining_blocker).toMatch(/NO_PRODUCTION_ERX_PROVIDER|NO_PRODUCTION_CLINICAL_ADAPTER/);
  });
});

describe('S68 eRx configuration validator', () => {
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

  it('NOT_CONFIGURED without adapter or core config', () => {
    expect(validateErxConfiguration({ ...base, nonMockAdapterRegistered: false })).toBe(
      'NOT_CONFIGURED',
    );
    expect(validateErxConfiguration({ ...base, credentialsPresent: false })).toBe('NOT_CONFIGURED');
  });

  it('CONFIGURED_BUT_UNAVAILABLE when webhook/env incomplete', () => {
    expect(validateErxConfiguration({ ...base, webhookOrCallbackConfigured: false })).toBe(
      'CONFIGURED_BUT_UNAVAILABLE',
    );
    expect(
      validateErxConfiguration({ ...base, healthcareEnvironment: 'sandbox' }),
    ).toBe('CONFIGURED_BUT_UNAVAILABLE');
  });

  it('VERIFIED → VERIFIED_BUT_DISABLED → APPROVED (credentials ≠ ENABLED)', () => {
    expect(validateErxConfiguration(base)).toBe('VERIFIED');
    expect(validateErxConfiguration({ ...base, humanApproved: true, liveEnabled: false })).toBe(
      'VERIFIED_BUT_DISABLED',
    );
    expect(validateErxConfiguration({ ...base, humanApproved: true, liveEnabled: true })).toBe(
      'APPROVED',
    );
  });
});

describe('S68 enablement guard', () => {
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

  it('requires full checklist including legal gate', () => {
    const guard = evaluateErxEnablementGuard({
      nonMockAdapterRegistered: true,
      healthcareEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      legalGateClear: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(true);
  });

  it('emergency disable blocks enablement', () => {
    const guard = evaluateErxEnablementGuard({
      nonMockAdapterRegistered: true,
      healthcareEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      legalGateClear: true,
      webhookProductionReady: true,
      emergencyDisabled: true,
    });
    expect(guard.can_enable).toBe(false);
  });
});

describe('S68 sandbox/production separation + fail-closed', () => {
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

  it('treats sandbox/null as mock eRx providers', () => {
    expect(isMockOrNullErxProvider('sandbox')).toBe(true);
    expect(isMockOrNullErxProvider('null')).toBe(true);
    expect(isMockOrNullErxProvider('LIVE_VENDOR_X')).toBe(false);
  });

  it('runtime ERX_PROVIDER only accepts sandbox or null', () => {
    process.env['ERX_PROVIDER'] = 'sandbox';
    expect(configuredErxRuntimeProvider()).toBe('sandbox');
    process.env['ERX_PROVIDER'] = 'some-live-vendor';
    expect(configuredErxRuntimeProvider()).toBeNull();
  });

  it('production healthcare gate never opens without live clinical adapter', async () => {
    process.env['HEALTHCARE_ENVIRONMENT'] = 'production';
    process.env['HEALTHCARE_LIVE_ENABLED'] = 'true';
    expect(readHealthcareEnvironment()).toBe('production');
    expect(isLiveHealthcareEnabled()).toBe(true);
    const prisma = {
      country: {
        findUnique: async () => ({
          id: 'c1',
          isoAlpha2: 'IN',
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
      countryCode: 'IN',
      kind: 'DOCTOR',
    });
    expect(result.available).toBe(false);
    expect(result.blockers).toContain('NO_PRODUCTION_CLINICAL_ADAPTER');
    expect(result.never_fallback_to_sandbox_adapter).toBe(true);
  });
});

describe('S68 legal gate + activation contract + globalization', () => {
  it('legal/clinical gate items are EXTERNAL_GATED / not claimed verified', () => {
    const items = listErxLegalClinicalGateItems();
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(items.every((i) => i.status === 'EXTERNAL_GATED' || i.status === 'BLOCKED')).toBe(true);
    expect(items.find((i) => i.id === 'controlled_medications')?.status).toBe('EXTERNAL_GATED');
  });

  it('ERX contract remains NOT_SELECTED / EXTERNAL_GATED', () => {
    const row = evaluateProviderActivation(getProviderActivationContract('ERX'));
    expect(row.provider_name).toBe('NOT_SELECTED');
    expect(row.enabled).toBe(false);
    expect(row.external_blocker).toBe('NO_PRODUCTION_CLINICAL_ADAPTER');
  });

  it('onboarding report has no hardcoded UPI/INR/₹/+91/IST and no fake PHI', () => {
    const blob = JSON.stringify(evaluateErxFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/patient_name|ssn|mrn/i);
  });

  it('documents internal prescription statuses separately from legal transmission', () => {
    const report = evaluateErxFirstOnboarding();
    expect(report.prescription_statuses_supported).toContain('DRAFT');
    expect(report.prescription_statuses_supported).toContain('ISSUED');
    expect(report.transmission).not.toBe('ENABLED');
  });
});

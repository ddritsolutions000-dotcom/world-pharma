/**
 * Sprint 67 — Carrier / logistics first onboarding (no fake live carrier).
 */
import {
  evaluateCarrierEnablementGuard,
  evaluateCarrierFirstOnboarding,
  validateCarrierConfiguration,
} from './carrier-first-onboarding';
import {
  assertSandboxOnlyLogisticsRuntime,
  isLiveCarrierEnabled,
  isMockCarrierCode,
  readLogisticsEnvironment,
} from './carrier.config';
import { evaluateProductionLogisticsAvailable } from './production-logistics-gate';
import { CountryProductionLifecycle, ProductionDependencyStatus } from '@prisma/client';
import { ProblemException } from '../common/problem';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';

describe('S67 carrier availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — no real carrier', () => {
    const report = evaluateCarrierFirstOnboarding();
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.real_carrier_available).toBe(false);
    expect(report.configured).toBe(false);
    expect(report.verified).toBe(false);
    expect(report.approved).toBe(false);
    expect(report.enabled).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.webhook).toBe('SANDBOX_ONLY');
    expect(report.validation_status).toBe('NOT_SELECTED');
    expect(report.pod).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.native_android).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.native_ios).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.secrets_printed).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.remaining_blocker).toMatch(/NO_PRODUCTION_CARRIER_ADAPTER/);
  });
});

describe('S67 carrier configuration validator', () => {
  const base = {
    providerSelected: true,
    nonMockAdapterRegistered: true,
    logisticsEnvironment: 'production' as const,
    liveEnabled: false,
    humanApproved: false,
    credentialsPresent: true,
    accountIdentifierPresent: true,
    originPickupConfigured: true,
    serviceConfigured: true,
    countrySupportConfigured: true,
    webhookConfigured: true,
  };

  it('NOT_SELECTED when provider not chosen', () => {
    expect(validateCarrierConfiguration({ ...base, providerSelected: false })).toBe('NOT_SELECTED');
  });

  it('NOT_CONFIGURED without adapter or core config', () => {
    expect(validateCarrierConfiguration({ ...base, nonMockAdapterRegistered: false })).toBe(
      'NOT_CONFIGURED',
    );
    expect(validateCarrierConfiguration({ ...base, credentialsPresent: false })).toBe('NOT_CONFIGURED');
  });

  it('CONFIGURED_BUT_UNAVAILABLE when webhook/env incomplete', () => {
    expect(validateCarrierConfiguration({ ...base, webhookConfigured: false })).toBe(
      'CONFIGURED_BUT_UNAVAILABLE',
    );
    expect(
      validateCarrierConfiguration({ ...base, logisticsEnvironment: 'sandbox' }),
    ).toBe('CONFIGURED_BUT_UNAVAILABLE');
  });

  it('VERIFIED → VERIFIED_BUT_DISABLED → APPROVED lifecycle (credentials ≠ ENABLED)', () => {
    expect(validateCarrierConfiguration(base)).toBe('VERIFIED');
    expect(validateCarrierConfiguration({ ...base, humanApproved: true, liveEnabled: false })).toBe(
      'VERIFIED_BUT_DISABLED',
    );
    expect(validateCarrierConfiguration({ ...base, humanApproved: true, liveEnabled: true })).toBe(
      'APPROVED',
    );
  });
});

describe('S67 enablement guard', () => {
  it('never enables without non-mock adapter', () => {
    const guard = evaluateCarrierEnablementGuard({
      nonMockAdapterRegistered: false,
      logisticsEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(false);
  });

  it('requires full checklist', () => {
    const guard = evaluateCarrierEnablementGuard({
      nonMockAdapterRegistered: true,
      logisticsEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      webhookProductionReady: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(true);
  });

  it('emergency disable blocks enablement', () => {
    const guard = evaluateCarrierEnablementGuard({
      nonMockAdapterRegistered: true,
      logisticsEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      webhookProductionReady: true,
      emergencyDisabled: true,
    });
    expect(guard.can_enable).toBe(false);
    expect(guard.checks.find((c) => c.id === 'not_emergency_disabled')?.ok).toBe(false);
  });
});

describe('S67 sandbox/production separation + fail-closed', () => {
  const prev = {
    env: process.env['LOGISTICS_ENVIRONMENT'],
    live: process.env['CARRIER_LIVE_ENABLED'],
    emergency: process.env['PROVIDER_EMERGENCY_DISABLE_CARRIER'],
  };

  afterEach(() => {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('LOGISTICS_ENVIRONMENT', prev.env);
    restore('CARRIER_LIVE_ENABLED', prev.live);
    restore('PROVIDER_EMERGENCY_DISABLE_CARRIER', prev.emergency);
  });

  it('production without live flag fail-closes', () => {
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    process.env['CARRIER_LIVE_ENABLED'] = 'false';
    expect(readLogisticsEnvironment()).toBe('production');
    expect(isLiveCarrierEnabled()).toBe(false);
    expect(() => assertSandboxOnlyLogisticsRuntime('s67')).toThrow(ProblemException);
  });

  it('treats MOCK_* as mock carrier', () => {
    expect(isMockCarrierCode('MOCK_CARRIER')).toBe(true);
    expect(isMockCarrierCode('DHL_LIVE')).toBe(false);
  });

  it('production logistics gate never opens without live adapter', async () => {
    process.env['LOGISTICS_ENVIRONMENT'] = 'production';
    process.env['CARRIER_LIVE_ENABLED'] = 'true';
    const prisma = {
      country: {
        findUnique: async () => ({
          id: 'c1',
          isoAlpha2: 'IN',
          productionLifecycle: CountryProductionLifecycle.ACTIVE,
        }),
      },
      productionDependency: {
        findFirst: async () => ({
          status: ProductionDependencyStatus.VERIFIED,
          configReference: 'vault:carrier',
          externalGated: false,
          providerIdentifier: 'HYPOTHETICAL_LIVE',
        }),
      },
      serviceabilityZone: { count: async () => 1 },
      carrierCoverage: { count: async () => 1 },
    } as never;
    const result = await evaluateProductionLogisticsAvailable(prisma, { countryCode: 'IN' });
    expect(result.available).toBe(false);
    expect(result.blockers).toContain('NO_PRODUCTION_CARRIER_ADAPTER');
    expect(result.never_fallback_to_mock).toBe(true);
    expect(result.external_gate).toBe('EXTERNAL_GATED');
  });
});

describe('S67 activation contract + serviceability framing', () => {
  it('CARRIER contract remains NOT_SELECTED / EXTERNAL_GATED', () => {
    const row = evaluateProviderActivation(getProviderActivationContract('CARRIER'));
    expect(row.provider_name).toBe('NOT_SELECTED');
    expect(row.enabled).toBe(false);
    expect(row.external_blocker).toBe('NO_PRODUCTION_CARRIER_ADAPTER');
  });

  it('onboarding report has no hardcoded UPI/INR/₹/+91/IST', () => {
    const blob = JSON.stringify(evaluateCarrierFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
  });

  it('serviceability is policy-driven (not inventing a live carrier)', () => {
    const report = evaluateCarrierFirstOnboarding();
    expect(report.serviceability).toBe('POLICY_DRIVEN');
    expect(report.tracking).toBe('SANDBOX_VERIFIED');
  });
});

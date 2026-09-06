/**
 * Sprint 70 — PACS / DICOM first onboarding (no fake live clinical PACS).
 */
import {
  evaluatePacsEnablementGuard,
  evaluatePacsFirstOnboarding,
  isMockOrSandboxPacsProvider,
  listPacsLegalClinicalGateItems,
  validatePacsConfiguration,
} from './pacs-first-onboarding';
import {
  isLiveHealthcareEnabled,
  readHealthcareEnvironment,
} from '../healthcare/healthcare-environment';
import { evaluateProductionHealthcareAvailable } from '../healthcare/production-healthcare-gate';
import { CountryProductionLifecycle, ProductionDependencyStatus } from '@prisma/client';
import { evaluateProviderActivation } from '../ops/provider-activation';
import { getProviderActivationContract } from '../ops/provider-activation-contracts';

describe('S70 PACS availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — no production PACS', () => {
    const report = evaluatePacsFirstOnboarding();
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.real_pacs_available).toBe(false);
    expect(report.configured).toBe(false);
    expect(report.enabled).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.transmission).toBe('SANDBOX_ONLY');
    expect(report.viewer).toBe('EXTERNAL_GATED');
    expect(report.storage_requirement).toMatch(/EXTERNAL_GATED|PRIVATE_STORAGE_EXTERNAL_GATED/);
    expect(report.remaining_blocker).toMatch(/NO_PRODUCTION_PACS_PROVIDER|NO_PRODUCTION_PACS_ADAPTER/);
    expect(report.secrets_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
    expect(report.dicom_payload_printed).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.capabilities.viewer_launch_session).toBe('EXTERNAL_GATED');
    expect(report.capabilities.idempotency).toBe('SANDBOX_VERIFIED');
  });
});

describe('S70 PACS configuration validator', () => {
  const base = {
    providerSelected: true,
    nonMockProductionAdapterRegistered: true,
    healthcareEnvironment: 'production' as const,
    liveEnabled: false,
    humanApproved: false,
    credentialsPresent: true,
    endpointConfigured: true,
    aeTitlesConfigured: true,
    countrySupportConfigured: true,
    viewerConfigured: true,
    objectStorageProductionReady: true,
    kmsReady: true,
    legalClinicalConfigured: true,
  };

  it('NOT_SELECTED when provider not chosen', () => {
    expect(validatePacsConfiguration({ ...base, providerSelected: false })).toBe('NOT_SELECTED');
  });

  it('NOT_CONFIGURED without production adapter or storage/KMS', () => {
    expect(
      validatePacsConfiguration({ ...base, nonMockProductionAdapterRegistered: false }),
    ).toBe('NOT_CONFIGURED');
    expect(validatePacsConfiguration({ ...base, objectStorageProductionReady: false })).toBe(
      'NOT_CONFIGURED',
    );
  });

  it('CONFIGURED_BUT_UNAVAILABLE when viewer/env incomplete', () => {
    expect(validatePacsConfiguration({ ...base, viewerConfigured: false })).toBe(
      'CONFIGURED_BUT_UNAVAILABLE',
    );
    expect(
      validatePacsConfiguration({ ...base, healthcareEnvironment: 'sandbox' }),
    ).toBe('CONFIGURED_BUT_UNAVAILABLE');
  });

  it('VERIFIED → VERIFIED_BUT_DISABLED → APPROVED (credentials ≠ ENABLED)', () => {
    expect(validatePacsConfiguration(base)).toBe('VERIFIED');
    expect(validatePacsConfiguration({ ...base, humanApproved: true, liveEnabled: false })).toBe(
      'VERIFIED_BUT_DISABLED',
    );
    expect(validatePacsConfiguration({ ...base, humanApproved: true, liveEnabled: true })).toBe(
      'APPROVED',
    );
  });
});

describe('S70 enablement guard', () => {
  it('never enables without production PACS adapter', () => {
    const guard = evaluatePacsEnablementGuard({
      nonMockProductionAdapterRegistered: false,
      healthcareEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      legalGateClear: true,
      objectStorageProductionReady: true,
      kmsReady: true,
      viewerProductionReady: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(false);
  });

  it('requires full checklist including storage/viewer', () => {
    const guard = evaluatePacsEnablementGuard({
      nonMockProductionAdapterRegistered: true,
      healthcareEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      legalGateClear: true,
      objectStorageProductionReady: true,
      kmsReady: true,
      viewerProductionReady: true,
      emergencyDisabled: false,
    });
    expect(guard.can_enable).toBe(true);
  });

  it('emergency disable blocks enablement', () => {
    const guard = evaluatePacsEnablementGuard({
      nonMockProductionAdapterRegistered: true,
      healthcareEnvironment: 'production',
      liveEnabled: true,
      humanApproved: true,
      legalGateClear: true,
      objectStorageProductionReady: true,
      kmsReady: true,
      viewerProductionReady: true,
      emergencyDisabled: true,
    });
    expect(guard.can_enable).toBe(false);
  });
});

describe('S70 sandbox/production fail-closed', () => {
  const prev = {
    env: process.env['HEALTHCARE_ENVIRONMENT'],
    live: process.env['HEALTHCARE_LIVE_ENABLED'],
  };

  afterEach(() => {
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore('HEALTHCARE_ENVIRONMENT', prev.env);
    restore('HEALTHCARE_LIVE_ENABLED', prev.live);
  });

  it('treats sandbox as non-production PACS', () => {
    expect(isMockOrSandboxPacsProvider('sandbox')).toBe(true);
    expect(isMockOrSandboxPacsProvider('VENDOR_PACS_PROD')).toBe(false);
  });

  it('production healthcare gate never opens without clinical adapter', async () => {
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
        findFirst: async () => ({
          dependencyType: 'PACS',
          status: ProductionDependencyStatus.VERIFIED,
          externalGated: false,
          configReference: 'vault:pacs',
        }),
      },
    } as never;
    const result = await evaluateProductionHealthcareAvailable(prisma, {
      countryCode: 'AE',
      kind: 'IMAGING_CENTER',
    });
    expect(result.available).toBe(false);
    expect(result.blockers).toContain('NO_PRODUCTION_CLINICAL_ADAPTER');
    expect(result.never_fallback_to_sandbox_adapter).toBe(true);
  });
});

describe('S70 legal gate + activation + globalization', () => {
  it('legal/clinical gate items remain EXTERNAL_GATED', () => {
    const items = listPacsLegalClinicalGateItems();
    expect(items.length).toBeGreaterThanOrEqual(6);
    expect(items.every((i) => i.status === 'EXTERNAL_GATED' || i.status === 'BLOCKED')).toBe(true);
    expect(items.find((i) => i.id === 'object_storage_kms')?.status).toBe('EXTERNAL_GATED');
  });

  it('PACS_DICOM contract remains NOT_SELECTED / EXTERNAL_GATED', () => {
    const row = evaluateProviderActivation(getProviderActivationContract('PACS_DICOM'));
    expect(row.provider_name).toBe('NOT_SELECTED');
    expect(row.enabled).toBe(false);
    expect(row.external_blocker).toBe('NO_PRODUCTION_CLINICAL_ADAPTER');
  });

  it('onboarding report has no hardcoded UPI/INR/₹/+91/IST and no DICOM/PHI dumps', () => {
    const blob = JSON.stringify(evaluatePacsFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/patient_name|ssn|mrn|application\/dicom/i);
    expect(blob).not.toMatch(/BEGIN PRIVATE KEY|apiSecret|eyJ/);
  });
});

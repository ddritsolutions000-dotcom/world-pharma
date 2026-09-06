/**
 * Sprint 80 — PACS / DICOM imaging activation readiness (no fake live PACS).
 */
import {
  NO_PRODUCTION_PACS_ADAPTER,
  NO_PRODUCTION_PACS_PROVIDER,
  buildImagingStudyLifecycleMachine,
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

describe('S80 PACS availability', () => {
  it('reports NOT_SELECTED / EXTERNAL_GATED — NO_PRODUCTION_PACS_PROVIDER', () => {
    const report = evaluatePacsFirstOnboarding();
    expect(report.sprint).toBeGreaterThanOrEqual(80);
    expect([70, 80]).toContain(report.foundation_sprint);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.real_pacs_available).toBe(false);
    expect(report.configured).toBe(false);
    expect(report.enabled).toBe(false);
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.transmission).toBe('SANDBOX_ONLY');
    expect(report.viewer).toBe('EXTERNAL_GATED');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_PACS_PROVIDER);
    expect(report.related_adapter_blocker).toBe(NO_PRODUCTION_PACS_ADAPTER);
    expect(report.object_storage).toBe('PRIVATE_STORAGE_EXTERNAL_GATED');
    expect(report.kms_encryption).toBe('KMS_EXTERNAL_GATED');
    expect(report.malware_scan).toBe('MALWARE_SCAN_EXTERNAL_GATED');
    expect(report.webhook).toBe('EXTERNAL_GATED');
    expect(report.fake_provider_invented).toBe(false);
    expect(report.fake_dicom_endpoint_invented).toBe(false);
    expect(report.fake_production_viewer).toBe(false);
    expect(report.enablement_guard.can_enable).toBe(false);
    expect(report.native_android).toBe('DEVICE_NOT_AVAILABLE');
    expect(report.native_ios).toBe('DEVICE_NOT_AVAILABLE');
  });
});

describe('S80 study lifecycle + permissions', () => {
  it('documents study machine and scoped access', () => {
    const life = buildImagingStudyLifecycleMachine();
    expect(life.success_path).toContain('SCHEDULED');
    expect(life.success_path).toContain('ACQUIRED');
    expect(life.idempotent_ingest).toBe(true);
    expect(life.terminal_overwrite_forbidden).toBe(true);

    const report = evaluatePacsFirstOnboarding();
    expect(report.permission_model.tenant_isolation).toBe(true);
    expect(report.permission_model.admin_activation_not_universal_image_access).toBe(true);
    expect(report.observability.no_dicom_payload_in_logs).toBe(true);
    expect(report.country_support).toBe('POLICY_DRIVEN');
  });
});

describe('S80 enablement guard', () => {
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
      malwareScanReady: true,
    });
    expect(guard.can_enable).toBe(false);
  });

  it('requires full checklist including malware and country policy', () => {
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
      malwareScanReady: true,
      countryPolicyConfigured: true,
    });
    expect(guard.can_enable).toBe(true);
  });

  it('blocks when malware scan missing', () => {
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
      malwareScanReady: false,
    });
    expect(guard.can_enable).toBe(false);
  });
});

describe('S80 configuration validator', () => {
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

  it('credentials alone never ENABLED', () => {
    expect(validatePacsConfiguration({ ...base, humanApproved: true, liveEnabled: true })).toBe(
      'APPROVED',
    );
  });
});

describe('S80 sandbox/production fail-closed', () => {
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

  it('treats sandbox as non-production; healthcare gate never opens', async () => {
    expect(isMockOrSandboxPacsProvider('sandbox')).toBe(true);
    process.env['HEALTHCARE_ENVIRONMENT'] = 'production';
    process.env['HEALTHCARE_LIVE_ENABLED'] = 'true';
    expect(readHealthcareEnvironment()).toBe('production');
    expect(isLiveHealthcareEnabled()).toBe(true);
    const prisma = {
      country: {
        findUnique: async () => ({
          id: 'c1',
          isoAlpha2: 'US',
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
      countryCode: 'US',
      kind: 'IMAGING_CENTER',
    });
    expect(result.available).toBe(false);
    expect(result.never_fallback_to_sandbox_adapter).toBe(true);
  });
});

describe('S80 legal gate + globalization', () => {
  it('legal items EXTERNAL_GATED; no DICOM/PHI/currency hardcoding', () => {
    const items = listPacsLegalClinicalGateItems();
    expect(items.every((i) => i.status === 'EXTERNAL_GATED' || i.status === 'BLOCKED')).toBe(true);
    const blob = JSON.stringify(evaluatePacsFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/patient_name|ssn|mrn|application\/dicom/i);
    expect(blob).not.toMatch(/BEGIN PRIVATE KEY|apiSecret|eyJ/);
  });

  it('PACS_DICOM contract remains NOT_SELECTED', () => {
    const row = evaluateProviderActivation(getProviderActivationContract('PACS_DICOM'));
    expect(row.provider_name).toBe('NOT_SELECTED');
    expect(row.enabled).toBe(false);
  });
});

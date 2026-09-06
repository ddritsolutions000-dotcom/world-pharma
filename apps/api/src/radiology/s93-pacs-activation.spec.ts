/**
 * Sprint 93 — Production PACS / DICOM activation readiness
 * (no fake live PACS / DICOM transmission / diagnostic viewer).
 */
import {
  NO_PRODUCTION_PACS_ADAPTER,
  NO_PRODUCTION_PACS_PROVIDER,
  PACS_AE_TITLE_REFERENCE_MISSING,
  PACS_CALLBACK_CONFIGURATION_MISSING,
  PACS_CREDENTIAL_REFERENCE_MISSING,
  PACS_DICOM_ENDPOINT_REFERENCE_MISSING,
  PACS_MALWARE_SCAN_DEPENDENCY_GATED,
  PACS_MARKET_LEGAL_CONFIGURATION_MISSING,
  PACS_PROVIDER_NOT_SELECTED,
  PACS_STORAGE_KMS_DEPENDENCY_GATED,
  PACS_TLS_CERTIFICATE_REFERENCE_MISSING,
  PACS_VIEWER_CONFIGURATION_MISSING,
  buildImagingStudyLifecycleMachine,
  evaluatePacsEnablementGuard,
  evaluatePacsFirstOnboarding,
  validatePacsConfiguration,
} from './pacs-first-onboarding';
import { validateProductionPacsConfiguration } from './production-pacs-requirements';

describe('S93 PACS activation contract', () => {
  it('reports Sprint 93 / NOT_SELECTED / EXTERNAL_GATED with blockers', () => {
    const report = evaluatePacsFirstOnboarding();
    expect(report.sprint).toBe(93);
    expect(report.foundation_sprint).toBe(80);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.activation_lifecycle).toBe('NOT_SELECTED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.transmission).toBe('SANDBOX_ONLY');
    expect(report.viewer).toBe('EXTERNAL_GATED');
    expect(report.enabled).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_PACS_PROVIDER);
    expect(report.related_adapter_blocker).toBe(NO_PRODUCTION_PACS_ADAPTER);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_PACS_PROVIDER,
        NO_PRODUCTION_PACS_ADAPTER,
        PACS_PROVIDER_NOT_SELECTED,
        PACS_CREDENTIAL_REFERENCE_MISSING,
        PACS_DICOM_ENDPOINT_REFERENCE_MISSING,
        PACS_AE_TITLE_REFERENCE_MISSING,
        PACS_TLS_CERTIFICATE_REFERENCE_MISSING,
        PACS_CALLBACK_CONFIGURATION_MISSING,
        PACS_MARKET_LEGAL_CONFIGURATION_MISSING,
        PACS_VIEWER_CONFIGURATION_MISSING,
        PACS_STORAGE_KMS_DEPENDENCY_GATED,
        PACS_MALWARE_SCAN_DEPENDENCY_GATED,
      ]),
    );
    expect(report.object_storage).toBe('PRIVATE_STORAGE_EXTERNAL_GATED');
    expect(report.kms_encryption).toBe('KMS_EXTERNAL_GATED');
    expect(report.malware_scan).toBe('MALWARE_SCAN_EXTERNAL_GATED');
    expect(report.fake_dicom_endpoint_invented).toBe(false);
    expect(report.fake_production_viewer).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
    expect(report.dicom_payload_printed).toBe(false);
  });

  it('configuration readiness + eligibility distinctions stay gated', () => {
    const v = validateProductionPacsConfiguration();
    expect(v.ready_for_activation).toBe(false);
    expect(v.secrets_exposed).toBe(false);
    expect(v.phi_exposed).toBe(false);
    expect(v.configuration_readiness.production_activation).toBe('EXTERNAL_GATED');
    expect(v.configuration_readiness.transmission).toBe('SANDBOX_ONLY');
    expect(v.configuration_readiness.viewer).toBe('EXTERNAL_GATED');
    expect(v.eligibility.report_page_equals_diagnostic_pacs_viewer).toBe(false);
    expect(v.eligibility.sandbox_study_equals_production_dicom_transmission).toBe(false);
    expect(v.eligibility.sandbox_storage_equals_production_private_storage).toBe(false);
    expect(v.eligibility.unscanned_content_equals_production_trusted).toBe(false);

    const report = evaluatePacsFirstOnboarding();
    expect(report.country_policy.markets_supported_for_evaluation).toEqual([
      'GLOBAL',
      'IN',
      'AE',
      'US',
    ]);
    expect(report.permission_model.customer_cannot_mutate_report_state).toBe(true);
    expect(report.identifier_handling.synthetic_uids_sandbox_only).toBe(true);
    expect(report.webhook_security.unsigned_fail_closed).toBe(true);
    expect(report.outbox_idempotency.fake_ack_cannot_mark_transmitted).toBe(true);
  });
});

describe('S93 lifecycle + enablement + globalization', () => {
  it('report ≠ viewer; sandbox ≠ production transmission; never ENABLED from mock', () => {
    const life = buildImagingStudyLifecycleMachine();
    expect(life.report_not_equal_diagnostic_viewer).toBe(true);
    expect(life.sandbox_not_equal_production_transmission).toBe(true);
    expect(life.idempotent_ingest).toBe(true);
    expect(life.terminal_overwrite_forbidden).toBe(true);

    expect(
      validatePacsConfiguration({
        providerSelected: true,
        nonMockProductionAdapterRegistered: true,
        healthcareEnvironment: 'production',
        liveEnabled: true,
        humanApproved: true,
        credentialsPresent: true,
        endpointConfigured: true,
        aeTitlesConfigured: true,
        countrySupportConfigured: true,
        viewerConfigured: true,
        objectStorageProductionReady: true,
        kmsReady: true,
        legalClinicalConfigured: true,
      }),
    ).toBe('APPROVED');

    expect(
      evaluatePacsEnablementGuard({
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
      }).can_enable,
    ).toBe(false);
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented vendors/endpoints', () => {
    const blob = JSON.stringify(evaluatePacsFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bORTHANC\b|\bDCM4CHEE\b|\b10\.\d+\.\d+\.\d+\b/i);
  });
});

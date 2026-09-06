/**
 * Sprint 91 — Production eRx activation readiness (no fake live provider / legal transmission).
 */
import {
  ERX_CALLBACK_CONFIGURATION_MISSING,
  ERX_CREDENTIAL_REFERENCE_MISSING,
  ERX_ENDPOINT_CONFIGURATION_MISSING,
  ERX_MARKET_LEGAL_CONFIGURATION_MISSING,
  ERX_NETWORK_ACCOUNT_REFERENCE_MISSING,
  ERX_PHARMACY_NETWORK_CONFIGURATION_MISSING,
  ERX_PRESCRIBER_ELIGIBILITY_CONFIGURATION_MISSING,
  ERX_PROVIDER_NOT_SELECTED,
  NO_PRODUCTION_CLINICAL_ADAPTER,
  NO_PRODUCTION_ERX_PROVIDER,
  buildErxSubmissionMachine,
  buildPrescriptionLifecycleMachine,
  evaluateErxEnablementGuard,
  evaluateErxFirstOnboarding,
  validateErxConfiguration,
} from './erx-first-onboarding';
import { validateProductionErxConfiguration } from './production-erx-requirements';

describe('S91 eRx activation contract', () => {
  it('reports Sprint 91 / NOT_SELECTED / EXTERNAL_GATED with blockers', () => {
    const report = evaluateErxFirstOnboarding();
    expect(report.sprint).toBe(91);
    expect(report.foundation_sprint).toBe(78);
    expect(report.provider).toBe('NOT_SELECTED');
    expect(report.activation_lifecycle).toBe('NOT_SELECTED');
    expect(report.production).toBe('EXTERNAL_GATED');
    expect(report.transmission).toBe('SANDBOX_ONLY');
    expect(report.enabled).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_ERX_PROVIDER);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_ERX_PROVIDER,
        NO_PRODUCTION_CLINICAL_ADAPTER,
        ERX_PROVIDER_NOT_SELECTED,
        ERX_CREDENTIAL_REFERENCE_MISSING,
        ERX_NETWORK_ACCOUNT_REFERENCE_MISSING,
        ERX_ENDPOINT_CONFIGURATION_MISSING,
        ERX_CALLBACK_CONFIGURATION_MISSING,
        ERX_MARKET_LEGAL_CONFIGURATION_MISSING,
        ERX_PRESCRIBER_ELIGIBILITY_CONFIGURATION_MISSING,
        ERX_PHARMACY_NETWORK_CONFIGURATION_MISSING,
      ]),
    );
    expect(report.internal_vs_legal).toBe('INTERNAL_RECORD_SEPARATE_FROM_LEGAL_TRANSMISSION');
    expect(report.controlled_substances).toBe('LEGAL_GATED');
    expect(report.fake_legal_transmission_claimed).toBe(false);
    expect(report.secrets_printed).toBe(false);
    expect(report.phi_printed).toBe(false);
  });

  it('configuration readiness + eligibility distinctions stay gated', () => {
    const v = validateProductionErxConfiguration();
    expect(v.ready_for_activation).toBe(false);
    expect(v.secrets_exposed).toBe(false);
    expect(v.phi_exposed).toBe(false);
    expect(v.configuration_readiness.production_activation).toBe('EXTERNAL_GATED');
    expect(v.configuration_readiness.transmission).toBe('SANDBOX_ONLY');
    expect(v.eligibility.doctor_document_verified_equals_clinical_approved).toBe(false);
    expect(v.eligibility.clinical_approved_equals_erx_production_enabled).toBe(false);
    expect(v.eligibility.pharmacy_verified_equals_erx_network_configured).toBe(false);

    const report = evaluateErxFirstOnboarding();
    expect(report.country_policy.markets_supported_for_evaluation).toEqual([
      'GLOBAL',
      'IN',
      'AE',
      'US',
    ]);
    expect(report.permission_model.customer_cannot_issue_or_transmit).toBe(true);
    expect(report.permission_model.pharmacy_cannot_issue_or_impersonate_prescriber).toBe(true);
  });
});

describe('S91 lifecycle + enablement + globalization', () => {
  it('ISSUED ≠ legal transmission; validator never ENABLED', () => {
    const life = buildPrescriptionLifecycleMachine();
    expect(life.issued_not_equal_legally_transmitted).toBe(true);
    expect(life.idempotent_submission).toBe(true);
    const sub = buildErxSubmissionMachine();
    expect(sub.never_claims_legal_without_provider).toBe(true);
    expect(sub.conceptual_aliases.TRANSMISSION_PENDING).toBe('PENDING');

    expect(
      validateErxConfiguration({
        providerSelected: true,
        nonMockAdapterRegistered: true,
        healthcareEnvironment: 'production',
        liveEnabled: true,
        humanApproved: true,
        credentialsPresent: true,
        accountIdentifierPresent: true,
        endpointConfigured: true,
        capabilityConfigured: true,
        countrySupportConfigured: true,
        webhookOrCallbackConfigured: true,
        legalClinicalConfigured: true,
      }),
    ).toBe('APPROVED');

    expect(
      evaluateErxEnablementGuard({
        nonMockAdapterRegistered: false,
        healthcareEnvironment: 'production',
        liveEnabled: true,
        humanApproved: true,
        legalGateClear: true,
        webhookProductionReady: true,
        emergencyDisabled: false,
      }).can_enable,
    ).toBe(false);
  });

  it('no hardcoded UPI/INR/₹/+91/IST or invented vendors', () => {
    const blob = JSON.stringify(evaluateErxFirstOnboarding());
    expect(blob).not.toMatch(/\bUPI\b/);
    expect(blob).not.toMatch(/\bINR\b/);
    expect(blob).not.toContain('₹');
    expect(blob).not.toContain('+91');
    expect(blob).not.toMatch(/\bIST\b/);
    expect(blob).not.toMatch(/\bSURESCRIPTS\b|\bNCPDP\b|\bTWILIO\b/i);
  });
});

/**
 * Sprint 127 — Lab partner onboarding + production activation control.
 */
import { PartnerStatus } from '@prisma/client';
import {
  NO_PRODUCTION_LAB_PARTNER_ACTIVATION,
  NO_PRODUCTION_CLINICAL_ADAPTER,
  LAB_ACCREDITATION_REGISTRY_EXTERNAL_GATED,
  LAB_PARTNER_ATTESTATION_CODE,
  mapPartnerStatusToLabOnboardingPhase,
  buildLabPartnerActivationGates,
  evaluateLabPartnerFailClosedCases,
  assertLabPartnerInvalidStateProtections,
  evaluateLabPartnerOnboardingActivationPreparation,
} from './lab-partner-onboarding-activation-preparation';
import { evaluateKycHealthcarePartnerVerificationActivationPreparation } from '../partner/kyc-healthcare-partner-verification-activation-preparation';
import { evaluateLabDiagnosticsRealUseClosure } from './lab-diagnostics-real-use-closure';
import { evaluateProductionSecurityGate } from '../ops/production-security-gate-consolidation';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S127 lab partner onboarding activation preparation', () => {
  it('production activation BLOCKED / no invented lab or accreditation', () => {
    const report = evaluateLabPartnerOnboardingActivationPreparation();
    expect(report.sprint).toBe(127);
    expect(report.authoritative_source).toBe('lab-partner-onboarding-activation-preparation');
    expect(report.parallel_lab_onboarding_framework_created).toBe(false);
    expect(report.parallel_kyc_framework_created).toBe(false);
    expect(report.parallel_catalog_system_created).toBe(false);
    expect(report.fake_lab_provider_invented).toBe(false);
    expect(report.fake_accreditation_claimed).toBe(false);
    expect(report.fake_registry_connected).toBe(false);
    expect(report.real_lab_production_enabled).toBe(false);
    expect(report.real_accreditation_verified).toBe(false);
    expect(report.document_verified_equals_partner_verified).toBe(false);
    expect(report.partner_verified_equals_production_enabled).toBe(false);
    expect(report.lab_provider.lifecycle).toBe('NOT_SELECTED');
    expect(report.lab_provider.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.lab_provider.production).toBe('EXTERNAL_GATED');
    expect(report.lab_provider.enabled).toBe(false);
    expect(report.lab_provider.attestation_is_legal_accreditation).toBe(false);
    expect(report.lab_provider.attestation_code).toBe(LAB_PARTNER_ATTESTATION_CODE);
    expect(report.admin_summary.production_lab_partner_activation).toBe('BLOCKED');
    expect(report.admin_summary.business_kyb).toBe('EXTERNAL_GATED');
    expect(report.admin_summary.healthcare_accreditation).toBe('EXTERNAL_GATED');
    expect(report.admin_summary.organization_tenant).toBe('READY');
    expect(report.admin_summary.market_policy).toBe('READY');
    expect(report.verification_separation.statement).toMatch(
      /DOCUMENT VERIFIED != PARTNER VERIFIED != PRODUCTION ENABLED/,
    );
    expect(report.onboarding_lifecycle.production_enabled_phase_reachable).toBe(false);
    expect(report.onboarding_lifecycle.phases).toEqual(
      expect.arrayContaining(['PROSPECT', 'ENABLED', 'SUSPENDED', 'DEACTIVATED']),
    );
    expect(report.tenant_isolation.status).toBe('PASS');
    expect(report.global_policy.hardcoded_india_global).toBe(false);
    expect(report.sandbox_vs_production.sandbox_cannot_satisfy_production).toBe(true);
    expect(report.production_fail_closed.overall).toBe('PASS');
    expect(report.force_launch_available).toBe(false);
    expect(report.force_enable_lab_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_LAB_PARTNER_ACTIVATION);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([
        NO_PRODUCTION_CLINICAL_ADAPTER,
        LAB_ACCREDITATION_REGISTRY_EXTERNAL_GATED,
      ]),
    );
    expect(report.secrets_printed).toBe(false);
    expect(report.pii_phi_printed).toBe(false);
    expect(report.lab_requirement_codes).toEqual(expect.arrayContaining(['lab_accreditation']));
    expect(buildLabPartnerActivationGates().length).toBeGreaterThanOrEqual(12);
  });

  it('fail-closed + invalid-state protections + phase mapping', () => {
    const cases = evaluateLabPartnerFailClosedCases();
    expect(cases.length).toBeGreaterThanOrEqual(8);
    expect(cases.every((c) => c.production_activation_blocked)).toBe(true);
    const integrity = assertLabPartnerInvalidStateProtections();
    expect(integrity.draft_cannot_skip_to_active).toBe(true);
    expect(integrity.verified_cannot_skip_to_active_without_approved).toBe(true);
    expect(integrity.suspended_cannot_go_directly_to_active).toBe(true);
    expect(integrity.rejected_is_terminal).toBe(true);
    expect(integrity.document_verified_neq_partner_verified).toBe(true);
    expect(integrity.partner_verified_neq_production_enabled).toBe(true);
    expect(integrity.sandbox_attestation_neq_legal_accreditation).toBe(true);
    expect(mapPartnerStatusToLabOnboardingPhase(PartnerStatus.DRAFT)).toBe('PROSPECT');
    expect(mapPartnerStatusToLabOnboardingPhase(PartnerStatus.DOCUMENTS_REQUIRED)).toBe(
      'DOCUMENTS_PENDING',
    );
    expect(mapPartnerStatusToLabOnboardingPhase(PartnerStatus.VERIFIED)).toBe('VERIFIED');
    expect(
      mapPartnerStatusToLabOnboardingPhase(PartnerStatus.ACTIVE, { productionEnabled: false }),
    ).toBe('ACTIVATION_PENDING');
    expect(mapPartnerStatusToLabOnboardingPhase(PartnerStatus.SUSPENDED)).toBe('SUSPENDED');
    expect(mapPartnerStatusToLabOnboardingPhase(PartnerStatus.ACTIVE, { kycExpired: true })).toBe(
      'EXPIRED',
    );
  });
});

describe('S127 compose + regression', () => {
  it('composes S124/S126/S116 and does not bypass launch control', () => {
    expect(
      evaluateKycHealthcarePartnerVerificationActivationPreparation().admin_summary
        .production_partner_verification,
    ).toBe('BLOCKED');
    expect(evaluateLabDiagnosticsRealUseClosure().can_production_launch).toBe('NO');
    expect(evaluateProductionSecurityGate().external_pentest_passed).toBe('NO');
    expect(
      evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'LABS' })
        .can_production_launch,
    ).toBe('NO');
    expect(
      assertNoSecretLeak(
        JSON.stringify(evaluateLabPartnerOnboardingActivationPreparation()),
      ),
    ).toBe(true);
  });

  it('no India hardcoding / no secret or invented provider leaks', () => {
    const blob = JSON.stringify(evaluateLabPartnerOnboardingActivationPreparation());
    expect(blob).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bIST\b|\bGST\b|\bPAN\b/);
    expect(blob).not.toMatch(/sk_live_|BEGIN PRIVATE KEY|apiSecret=/i);
    expect(blob).not.toMatch(/Provider:\s*Onfido|NABL\s*LIVE|CAP\s*accredited\s*production/i);
  });
});

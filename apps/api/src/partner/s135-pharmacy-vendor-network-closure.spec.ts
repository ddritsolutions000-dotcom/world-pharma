/**
 * Sprint 135 — Pharmacy / vendor network + onboarding closure (unit).
 */
import { KycCaseStatus, PartnerStatus } from '@prisma/client';
import {
  NO_PRODUCTION_PHARMACY_VENDOR_NETWORK,
  NO_PRODUCTION_KYC_KYB_PROVIDER,
  mapPartnerStatusToPharmacyVendorPhase,
  buildPharmacyVendorActivationGates,
  evaluatePharmacyVendorFailClosedCases,
  assertPharmacyVendorInvalidStateProtections,
  evaluatePartnerFulfillmentEligibility,
  evaluateVendorSettlementAuthorizationInvariants,
  evaluatePharmacyVendorNetworkClosure,
  DOCUMENT_NEQ_PARTNER_VERIFIED,
  SETTLEMENT_VENDOR_READONLY,
} from './pharmacy-vendor-network-closure';
import { evaluateVendorFulfillmentRealUseClosure } from '../orders/vendor-fulfillment-real-use-closure';
import { evaluateKycHealthcarePartnerVerificationActivationPreparation } from './kyc-healthcare-partner-verification-activation-preparation';
import { evaluateProductionLaunchControl } from '../ops/production-launch-control';
import { assertNoSecretLeak } from '../ops/secret-redaction';

describe('S135 pharmacy vendor network closure', () => {
  it('software lifecycle closed; production network BLOCKED', () => {
    const report = evaluatePharmacyVendorNetworkClosure();
    expect(report.sprint).toBe(135);
    expect(report.authoritative_source).toBe('pharmacy-vendor-network-closure');
    expect(report.parallel_partner_framework_created).toBe(false);
    expect(report.parallel_catalog_system_created).toBe(false);
    expect(report.parallel_fulfillment_system_created).toBe(false);
    expect(report.fake_pharmacy_invented).toBe(false);
    expect(report.fake_license_claimed).toBe(false);
    expect(report.real_pharmacy_production_enabled).toBe(false);
    expect(report.document_verified_equals_partner_verified).toBe(false);
    expect(report.partner_verified_equals_approved).toBe(false);
    expect(report.approved_equals_production_enabled).toBe(false);
    expect(report.pharmacy_vendor.lifecycle).toBe('NETWORK_SOFTWARE_CLOSED');
    expect(report.pharmacy_vendor.sandbox).toBe('SANDBOX_VERIFIED');
    expect(report.pharmacy_vendor.production).toBe('EXTERNAL_GATED');
    expect(report.pharmacy_vendor.enabled).toBe(false);
    expect(report.admin_summary.production_pharmacy_vendor_network).toBe('BLOCKED');
    expect(report.admin_summary.catalog_ownership).toBe('READY');
    expect(report.admin_summary.fulfillment).toBe('SOFTWARE_READY');
    expect(report.verification_separation.statement).toMatch(
      /DOCUMENT VERIFIED != PARTNER VERIFIED != PARTNER APPROVED != PRODUCTION ENABLED/,
    );
    expect(report.onboarding_lifecycle.production_enabled_phase_reachable).toBe(false);
    expect(report.onboarding_lifecycle.phases).toEqual(
      expect.arrayContaining([
        'PROSPECT',
        'APPLICATION',
        'DOCUMENTS',
        'VERIFICATION',
        'APPROVED',
        'ENABLED',
        'ORDER_FULFILLMENT',
        'SETTLEMENT',
        'SUSPENDED',
      ]),
    );
    expect(report.tenant_isolation.status).toBe('PASS');
    expect(report.global_policy.hardcoded_india_global).toBe(false);
    expect(report.customer_marketplace.ui_redesign).toBe(false);
    expect(report.force_launch_available).toBe(false);
    expect(report.can_production_launch).toBe('NO');
    expect(report.remaining_blocker).toBe(NO_PRODUCTION_PHARMACY_VENDOR_NETWORK);
    expect(report.remaining_blockers).toEqual(
      expect.arrayContaining([NO_PRODUCTION_KYC_KYB_PROVIDER]),
    );
    expect(report.secrets_printed).toBe(false);
    expect(buildPharmacyVendorActivationGates().length).toBeGreaterThanOrEqual(12);
    expect(assertNoSecretLeak(JSON.stringify(report))).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/\bUPI\b|\bINR\b|₹|\+91|\bGST\b|\bPAN\b/);
  });

  it('fail-closed + invalid-state + phase mapping', () => {
    const cases = evaluatePharmacyVendorFailClosedCases();
    expect(cases.length).toBeGreaterThanOrEqual(8);
    expect(cases.every((c) => c.production_fulfillment_blocked)).toBe(true);
    expect(cases[0]!.primary_blocker).toBe(DOCUMENT_NEQ_PARTNER_VERIFIED);
    const integrity = assertPharmacyVendorInvalidStateProtections();
    expect(integrity.draft_cannot_skip_to_active).toBe(true);
    expect(integrity.verified_cannot_skip_to_active).toBe(true);
    expect(integrity.suspended_cannot_go_directly_to_active).toBe(true);
    expect(integrity.document_verified_neq_partner_verified).toBe(true);
    expect(integrity.approved_neq_production_enabled).toBe(true);
    expect(mapPartnerStatusToPharmacyVendorPhase(PartnerStatus.DRAFT)).toBe('PROSPECT');
    expect(mapPartnerStatusToPharmacyVendorPhase(PartnerStatus.DOCUMENTS_REQUIRED)).toBe(
      'DOCUMENTS',
    );
    expect(mapPartnerStatusToPharmacyVendorPhase(PartnerStatus.VERIFIED)).toBe('VERIFICATION');
    expect(mapPartnerStatusToPharmacyVendorPhase(PartnerStatus.APPROVED)).toBe('APPROVED');
    expect(
      mapPartnerStatusToPharmacyVendorPhase(PartnerStatus.ACTIVE, {
        productionEnabled: false,
        catalogReady: true,
      }),
    ).toBe('ORDER_FULFILLMENT');
    expect(mapPartnerStatusToPharmacyVendorPhase(PartnerStatus.SUSPENDED)).toBe('SUSPENDED');
    expect(
      mapPartnerStatusToPharmacyVendorPhase(PartnerStatus.ACTIVE, { kycExpired: true }),
    ).toBe('EXPIRED');
  });

  it('partner fulfillment eligibility: suspended/unverified/expired blocked', () => {
    expect(
      evaluatePartnerFulfillmentEligibility({ partnerStatus: PartnerStatus.ACTIVE }).allowed,
    ).toBe(true);
    expect(
      evaluatePartnerFulfillmentEligibility({ partnerStatus: PartnerStatus.SUSPENDED }).blocker,
    ).toBe('PARTNER_SUSPENDED');
    expect(
      evaluatePartnerFulfillmentEligibility({ partnerStatus: PartnerStatus.VERIFIED }).blocker,
    ).toBe('PARTNER_NOT_ACTIVE');
    expect(
      evaluatePartnerFulfillmentEligibility({
        partnerStatus: PartnerStatus.ACTIVE,
        kycStatus: KycCaseStatus.EXPIRED,
      }).blocker,
    ).toBe('KYC_EXPIRED');
    expect(
      evaluatePartnerFulfillmentEligibility({
        partnerStatus: PartnerStatus.ACTIVE,
        kycExpiresAt: new Date(Date.now() - 60_000),
      }).blocker,
    ).toBe('KYC_EXPIRED');
    expect(evaluatePartnerFulfillmentEligibility({ partnerStatus: null }).allowed).toBe(true);
  });

  it('settlement authorization: vendor cannot mark paid or alter amounts', () => {
    const invariants = evaluateVendorSettlementAuthorizationInvariants();
    expect(invariants.find((i) => i.case_id === 'view_payables')?.outcome).toBe('ALLOWED');
    expect(invariants.find((i) => i.case_id === 'mark_settlement_paid')?.outcome).toBe('DENIED');
    expect(invariants.find((i) => i.case_id === 'alter_settlement_amount')?.detail).toBe(
      SETTLEMENT_VENDOR_READONLY,
    );
  });
});

describe('S135 compose + regression', () => {
  it('composes S123/S124 and does not bypass launch', () => {
    expect(evaluateVendorFulfillmentRealUseClosure().can_production_launch).toBe('NO');
    expect(
      evaluateKycHealthcarePartnerVerificationActivationPreparation().remaining_blocker,
    ).toBe(NO_PRODUCTION_KYC_KYB_PROVIDER);
    expect(
      evaluateProductionLaunchControl({ market: 'GLOBAL', service_scope: 'GLOBAL' })
        .can_production_launch,
    ).toBe('NO');
  });
});

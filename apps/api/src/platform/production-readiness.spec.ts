import {
  assertProductionLifecycleTransition,
  canTransitionProductionLifecycle,
  type ProductionLifecycleState,
} from './production-lifecycle';
import {
  computeProductionReadiness,
  isEvidenceSatisfying,
  type ProductionReadinessResult,
  type RequirementCoverageRow,
} from './production-readiness';
import type { MarketReadinessInput } from './market-readiness';

describe('production-lifecycle', () => {
  it('allows CONFIGURED → UNDER_REVIEW', () => {
    expect(canTransitionProductionLifecycle('CONFIGURED', 'UNDER_REVIEW')).toBe(true);
  });

  it('rejects CONFIGURED → ACTIVE', () => {
    expect(canTransitionProductionLifecycle('CONFIGURED', 'ACTIVE')).toBe(false);
  });

  it('allows ACTIVE → SUSPENDED and SUSPENDED → UNDER_REVIEW', () => {
    expect(canTransitionProductionLifecycle('ACTIVE', 'SUSPENDED')).toBe(true);
    expect(canTransitionProductionLifecycle('SUSPENDED', 'UNDER_REVIEW')).toBe(true);
  });

  it('rejects SUSPENDED → ACTIVE shortcut', () => {
    expect(() => assertProductionLifecycleTransition('SUSPENDED', 'ACTIVE')).toThrow(/Invalid/);
  });

  it('allows READY_FOR_ACTIVATION → ACTIVE', () => {
    expect(canTransitionProductionLifecycle('READY_FOR_ACTIVATION', 'ACTIVE')).toBe(true);
  });
});

describe('isEvidenceSatisfying', () => {
  const now = new Date('2026-06-01T00:00:00.000Z');

  it('accepts verified non-expiring evidence', () => {
    expect(isEvidenceSatisfying({ status: 'VERIFIED', expiresAt: null, now })).toBe(true);
  });

  it('rejects expired verified evidence', () => {
    expect(
      isEvidenceSatisfying({
        status: 'VERIFIED',
        expiresAt: '2026-01-01T00:00:00.000Z',
        now,
      }),
    ).toBe(false);
  });

  it('rejects rejected evidence even if not expired', () => {
    expect(isEvidenceSatisfying({ status: 'REJECTED', expiresAt: null, now })).toBe(false);
  });

  it('accepts verified future expiry', () => {
    expect(
      isEvidenceSatisfying({
        status: 'VERIFIED',
        expiresAt: '2027-01-01T00:00:00.000Z',
        now,
      }),
    ).toBe(true);
  });
});

function baseCommerce(): MarketReadinessInput {
  return {
    countryStatus: 'INACTIVE',
    currency: 'XXX',
    hasPublishedPolicyPack: true,
    paymentPolicyConfigured: true,
    deliveryPolicyConfigured: true,
    serviceabilityZonesActive: 1,
    notificationProvidersConfigured: 1,
    settlementPolicyConfigured: true,
    livePaymentEnabled: false,
  };
}

function coverage(partial: Partial<RequirementCoverageRow> & { code: string }): RequirementCoverageRow {
  return {
    label: partial.code,
    mandatory: true,
    evidence_id: null,
    evidence_status: null,
    satisfied: false,
    expires_at: null,
    blocker: 'LEGAL_EVIDENCE_MISSING',
    ...partial,
  };
}

describe('computeProductionReadiness', () => {
  it('blocks when legal evidence missing', () => {
    const result = computeProductionReadiness({
      commerce: baseCommerce(),
      healthcarePolicyPublished: true,
      allRequirementsMet: false,
      anyEvidenceExpired: false,
      commercialNetworkPresent: true,
      livePspConfigured: true,
      liveOtpConfigured: true,
      liveMessagingConfigured: true,
      liveCarrierConfigured: true,
      kycProviderVerified: true,
      pharmacyLicenceVerified: true,
      kycVerified: true,
      commercialApprovalPresent: true,
      requirementCoverage: [coverage({ code: 'pharmacy_licensing' })],
      productionLifecycle: 'UNDER_REVIEW',
    });
    expect(result.production_ready).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining(['LEGAL_EVIDENCE_MISSING']));
  });

  it('blocks on expired evidence', () => {
    const result = computeProductionReadiness({
      commerce: baseCommerce(),
      healthcarePolicyPublished: true,
      allRequirementsMet: false,
      anyEvidenceExpired: true,
      commercialNetworkPresent: true,
      livePspConfigured: true,
      liveOtpConfigured: true,
      liveMessagingConfigured: true,
      liveCarrierConfigured: true,
      kycProviderVerified: true,
      pharmacyLicenceVerified: true,
      kycVerified: true,
      commercialApprovalPresent: true,
      requirementCoverage: [
        coverage({
          code: 'pharmacy_licensing',
          blocker: 'LEGAL_EVIDENCE_EXPIRED',
          evidence_status: 'VERIFIED',
        }),
      ],
      productionLifecycle: 'UNDER_REVIEW',
    });
    expect(result.dimensions.find((d) => d.dimension === 'LEGAL')?.status).toBe('WARNING');
    expect(result.blockers).toEqual(expect.arrayContaining(['LEGAL_EVIDENCE_EXPIRED']));
  });

  it('blocks partner when pharmacy licence missing', () => {
    const result = computeProductionReadiness({
      commerce: baseCommerce(),
      healthcarePolicyPublished: true,
      allRequirementsMet: true,
      anyEvidenceExpired: false,
      commercialNetworkPresent: true,
      livePspConfigured: true,
      liveOtpConfigured: true,
      liveMessagingConfigured: true,
      liveCarrierConfigured: true,
      kycProviderVerified: true,
      pharmacyLicenceVerified: false,
      kycVerified: true,
      commercialApprovalPresent: true,
      requirementCoverage: [],
      productionLifecycle: 'READY_FOR_ACTIVATION',
    });
    expect(result.blockers).toEqual(expect.arrayContaining(['PHARMACY_LICENCE_MISSING']));
    expect(result.activation_eligible).toBe(false);
  });

  it('is activation eligible when all dimensions pass and lifecycle ready', () => {
    const result = computeProductionReadiness({
      commerce: baseCommerce(),
      healthcarePolicyPublished: true,
      allRequirementsMet: true,
      anyEvidenceExpired: false,
      commercialNetworkPresent: true,
      livePspConfigured: true,
      liveOtpConfigured: true,
      liveMessagingConfigured: true,
      liveCarrierConfigured: true,
      kycProviderVerified: true,
      pharmacyLicenceVerified: true,
      kycVerified: true,
      commercialApprovalPresent: true,
      requirementCoverage: [
        coverage({ code: 'pharmacy_licensing', satisfied: true, blocker: null, evidence_status: 'VERIFIED' }),
      ],
      productionLifecycle: 'READY_FOR_ACTIVATION' as ProductionLifecycleState,
    });
    expect(result.production_ready).toBe(true);
    expect(result.activation_eligible).toBe(true);
    expect(result.overall_status).toBe('READY');
  });

  it('marks suspended overall when lifecycle is SUSPENDED', () => {
    const result = computeProductionReadiness({
      commerce: baseCommerce(),
      healthcarePolicyPublished: true,
      allRequirementsMet: true,
      anyEvidenceExpired: false,
      commercialNetworkPresent: true,
      livePspConfigured: true,
      liveOtpConfigured: true,
      liveMessagingConfigured: true,
      liveCarrierConfigured: true,
      kycProviderVerified: true,
      pharmacyLicenceVerified: true,
      kycVerified: true,
      commercialApprovalPresent: true,
      requirementCoverage: [],
      productionLifecycle: 'SUSPENDED',
    });
    expect(result.overall_status).toBe('SUSPENDED');
    expect(result.activation_eligible).toBe(false);
  });
});

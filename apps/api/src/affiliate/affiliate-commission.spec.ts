import { computeAffiliateCommissionPreview } from './affiliate-commission';

describe('computeAffiliateCommissionPreview', () => {
  it('computes sandbox commission for eligible OTC orders', () => {
    const result = computeAffiliateCommissionPreview({
      baseMinor: 2000n,
      commissionBps: 500,
      clinical: false,
      clinicalCategoriesAllowed: false,
      hasActiveCode: true,
      selfReferral: false,
    });
    expect(result.preview_minor).toBe('100');
    expect(result.payable).toBe(true);
    expect(result.clinical_blocked).toBe(false);
  });

  it('blocks clinical orders when clinical categories are disabled', () => {
    const result = computeAffiliateCommissionPreview({
      baseMinor: 2000n,
      commissionBps: 500,
      clinical: true,
      clinicalCategoriesAllowed: false,
      hasActiveCode: true,
      selfReferral: false,
    });
    expect(result.preview_minor).toBe('0');
    expect(result.payable).toBe(false);
    expect(result.clinical_blocked).toBe(true);
  });

  it('blocks self-referral', () => {
    const result = computeAffiliateCommissionPreview({
      baseMinor: 2000n,
      commissionBps: 500,
      clinical: false,
      clinicalCategoriesAllowed: false,
      hasActiveCode: true,
      selfReferral: true,
    });
    expect(result.payable).toBe(false);
    expect(result.clinical_blocked).toBe(true);
  });
});

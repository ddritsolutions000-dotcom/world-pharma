import {
  computePartnerNet,
  DEFAULT_PARTNER_PLATFORM_FEE_BPS,
  resolvePartnerPlatformFeeBps,
} from './partner-platform-fee';

describe('partner-platform-fee', () => {
  it('computes net after platform fee bps', () => {
    const result = computePartnerNet({
      grossMinor: 50_000n,
      platformFeeBps: 1500,
    });
    expect(result.platformFeeMinor).toBe(7_500n);
    expect(result.netMinor).toBe(42_500n);
  });

  it('raises platform fee to cover attributed affiliate (no company loss)', () => {
    const result = computePartnerNet({
      grossMinor: 100_000n,
      platformFeeBps: 200, // 2%
      affiliateCommissionMinor: 5_000n, // 5%
    });
    expect(result.platformFeeMinor).toBe(5_000n);
    expect(result.netMinor).toBe(95_000n);
  });

  it('resolves pack rates then defaults', () => {
    expect(resolvePartnerPlatformFeeBps('lab', { lab_platform_fee_bps: 2500 })).toBe(2500);
    expect(resolvePartnerPlatformFeeBps('doctor', null)).toBe(DEFAULT_PARTNER_PLATFORM_FEE_BPS.doctor);
  });
});

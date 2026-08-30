import { AffiliateLinkStatus, AffiliateReferralCodeStatus } from '@prisma/client';
import {
  assertLinkTransition,
  assertReferralCodeTransition,
  isRedeemableReferralCode,
  normalizeReferralCode,
} from './affiliate-status';

describe('affiliate-status', () => {
  it('normalizes referral codes', () => {
    expect(normalizeReferralCode('  save-10 ')).toBe('SAVE-10');
    expect(normalizeReferralCode('bad code!')).toBe('BADCODE');
  });

  it('allows draft to active referral transition', () => {
    expect(() =>
      assertReferralCodeTransition(AffiliateReferralCodeStatus.DRAFT, AffiliateReferralCodeStatus.ACTIVE),
    ).not.toThrow();
  });

  it('rejects expired to active referral transition', () => {
    expect(() =>
      assertReferralCodeTransition(AffiliateReferralCodeStatus.EXPIRED, AffiliateReferralCodeStatus.ACTIVE),
    ).toThrow();
  });

  it('detects redeemable active codes', () => {
    expect(
      isRedeemableReferralCode(AffiliateReferralCodeStatus.ACTIVE, new Date(Date.now() + 60_000)),
    ).toBe(true);
    expect(
      isRedeemableReferralCode(AffiliateReferralCodeStatus.INACTIVE, new Date(Date.now() + 60_000)),
    ).toBe(false);
  });

  it('allows active to inactive link transition', () => {
    expect(() =>
      assertLinkTransition(AffiliateLinkStatus.ACTIVE, AffiliateLinkStatus.INACTIVE),
    ).not.toThrow();
  });
});

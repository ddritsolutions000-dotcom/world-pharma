import { AffiliateLiabilityStatus } from '@prisma/client';
import { ProblemException } from '../common/problem';
import {
  assertAffiliateLiabilityTransition,
  isAffiliateOrderIneligible,
} from './affiliate-liability-status';

describe('affiliate-liability-status', () => {
  it('allows PENDING to APPROVED and PAYABLE chain', () => {
    expect(() =>
      assertAffiliateLiabilityTransition(AffiliateLiabilityStatus.PENDING, AffiliateLiabilityStatus.APPROVED),
    ).not.toThrow();
    expect(() =>
      assertAffiliateLiabilityTransition(AffiliateLiabilityStatus.APPROVED, AffiliateLiabilityStatus.PAYABLE),
    ).not.toThrow();
  });

  it('blocks affiliate-forged PAID transition from PENDING', () => {
    expect(() =>
      assertAffiliateLiabilityTransition(AffiliateLiabilityStatus.PENDING, AffiliateLiabilityStatus.PAID),
    ).toThrow(ProblemException);
  });

  it('marks cancelled orders ineligible', () => {
    expect(isAffiliateOrderIneligible('CANCELLED')).toBe(true);
    expect(isAffiliateOrderIneligible('CONFIRMED')).toBe(false);
  });
});

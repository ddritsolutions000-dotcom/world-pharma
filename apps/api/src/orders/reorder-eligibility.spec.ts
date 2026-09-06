import { isReorderEligible } from './reorder-eligibility';

describe('isReorderEligible', () => {
  it('allows delivered orders only', () => {
    expect(isReorderEligible('DELIVERED')).toBe(true);
    expect(isReorderEligible('SHIPPED')).toBe(false);
    expect(isReorderEligible('CANCELLED')).toBe(false);
  });
});

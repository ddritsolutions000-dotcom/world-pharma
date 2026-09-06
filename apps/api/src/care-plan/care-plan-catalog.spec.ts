import { carePlanById, carePlanDiscountMinor, CARE_PLANS } from './care-plan-catalog';

describe('care plan catalog', () => {
  it('lists three 1mg-style plans', () => {
    expect(CARE_PLANS.map((p) => p.id)).toEqual(['diabetes', 'family', 'senior']);
  });

  it('applies member percent off in minor units', () => {
    expect(carePlanDiscountMinor(10000n, 1500).toString()).toBe('1500');
    expect(carePlanDiscountMinor(0n, 1500).toString()).toBe('0');
    expect(carePlanById('family')?.free_delivery).toBe(true);
  });
});

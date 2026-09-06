import { computeCommerceFees } from './commerce-fees';

describe('computeCommerceFees', () => {
  it('computes platform fee from bps and flat minor', () => {
    const result = computeCommerceFees({
      sell_minor: 10000n,
      discount_minor: 0n,
      platform_fee_bps: 250,
      platform_fee_flat_minor: 50,
      delivery_fee_minor: 0,
      packaging_fee_minor: 0,
      handling_fee_minor: 0,
      payment_convenience_fee_minor: 0,
      free_delivery_threshold_minor: null,
      carrier_cost_estimate_minor: 0,
    });
    expect(result.platform_fee_minor).toBe('300');
    expect(result.total_minor).toBe('10300');
  });

  it('waives customer delivery when subtotal meets free threshold', () => {
    const result = computeCommerceFees({
      sell_minor: 5000n,
      discount_minor: 0n,
      platform_fee_bps: 0,
      platform_fee_flat_minor: 0,
      delivery_fee_minor: 800,
      packaging_fee_minor: 0,
      handling_fee_minor: 0,
      payment_convenience_fee_minor: 0,
      free_delivery_threshold_minor: 5000,
      carrier_cost_estimate_minor: 2000,
    });
    expect(result.delivery_fee_minor).toBe('0');
    expect(result.delivery_subsidy_minor).toBe('2000');
    expect(result.shipping_status).toBe('QUOTED');
  });

  it('tracks company delivery subsidy when carrier cost exceeds customer charge', () => {
    const result = computeCommerceFees({
      sell_minor: 1000n,
      discount_minor: 0n,
      platform_fee_bps: 0,
      platform_fee_flat_minor: 0,
      delivery_fee_minor: 800,
      packaging_fee_minor: 0,
      handling_fee_minor: 0,
      payment_convenience_fee_minor: 0,
      free_delivery_threshold_minor: null,
      carrier_cost_estimate_minor: 2000,
    });
    expect(result.delivery_fee_minor).toBe('800');
    expect(result.carrier_actual_cost_minor).toBe('2000');
    expect(result.delivery_subsidy_minor).toBe('1200');
    expect(result.total_minor).toBe('1800');
  });
});

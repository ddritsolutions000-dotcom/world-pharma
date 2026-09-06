import { evaluatePartnerPayoutSoftwareReadiness } from './partner-payout-software-readiness';

describe('partner payout software readiness (awaiting gateway)', () => {
  it('reports sandbox ready and awaiting gateway by default', () => {
    const report = evaluatePartnerPayoutSoftwareReadiness();
    expect(report.software_rail_complete).toBe(true);
    expect(report.sandbox_withdraw_ready).toBe(true);
    expect(report.phase).toBe('SANDBOX_READY_AWAITING_GATEWAY');
    expect(report.gateway.connected).toBe(false);
    expect(report.gateway.awaiting).toBe('GATEWAY_CREDENTIALS');
    expect(report.live_ready).toBe(false);
    expect(report.wallet_scopes).toEqual(['LAB', 'AFFILIATE', 'DELIVERY', 'DOCTOR']);
    expect(report.plug_razorpay_later.length).toBeGreaterThan(5);
  });
});

import { AllowlistRiskAdapter } from './allowlist.risk';

describe('AllowlistRiskAdapter', () => {
  const adapter = new AllowlistRiskAdapter();
  const prevEnv = process.env['PAYMENT_ENVIRONMENT'];
  const prevLive = process.env['PAYMENT_LIVE_ENABLED'];

  afterEach(() => {
    if (prevEnv === undefined) {
      delete process.env['PAYMENT_ENVIRONMENT'];
    } else {
      process.env['PAYMENT_ENVIRONMENT'] = prevEnv;
    }
    if (prevLive === undefined) {
      delete process.env['PAYMENT_LIVE_ENABLED'];
    } else {
      process.env['PAYMENT_LIVE_ENABLED'] = prevLive;
    }
  });

  it('allows sandbox payments', async () => {
    delete process.env['PAYMENT_ENVIRONMENT'];
    const decision = await adapter.assess({
      personId: 'p1',
      countryIso2: 'XX',
      amountMinor: 100n,
      currency: 'XXX',
      method: 'CARD',
    });
    expect(decision.allow).toBe(true);
  });

  it('fail-closes production live mode without approved risk adapter', async () => {
    process.env['PAYMENT_ENVIRONMENT'] = 'production';
    process.env['PAYMENT_LIVE_ENABLED'] = 'true';
    delete process.env['PAYMENT_RISK_ADAPTER'];
    const decision = await adapter.assess({
      personId: 'p1',
      countryIso2: 'US',
      amountMinor: 100n,
      currency: 'USD',
      method: 'CARD',
    });
    expect(decision.allow).toBe(false);
  });
});

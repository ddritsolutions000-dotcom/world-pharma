import {
  computeMarketReadiness,
  legacyReadinessAlias,
  parsePolicyCommerceSignals,
  type MarketReadinessInput,
} from './market-readiness';

describe('market-readiness', () => {
  const base: MarketReadinessInput = {
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

  it('marks READY_FOR_ACTIVATION when internal config is complete and country inactive', () => {
    const result = computeMarketReadiness(base);
    expect(result.readiness).toBe('READY_FOR_ACTIVATION');
    expect(result.can_activate_sandbox).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.external_gates).toContain('LIVE_PSP_EXTERNAL_GATED');
    expect(result.healthcare.status).toBe('NOT_MODELED');
  });

  it('blocks activation when currency missing', () => {
    const result = computeMarketReadiness({ ...base, currency: '' });
    expect(result.blockers).toContain('CURRENCY_NOT_CONFIGURED');
    expect(result.can_activate_sandbox).toBe(false);
    expect(result.readiness).toBe('NOT_READY');
  });

  it('blocks when policy pack missing', () => {
    const result = computeMarketReadiness({
      ...base,
      hasPublishedPolicyPack: false,
      paymentPolicyConfigured: false,
      deliveryPolicyConfigured: false,
    });
    expect(result.blockers).toContain('POLICY_PACK_MISSING');
    expect(result.can_activate_sandbox).toBe(false);
  });

  it('never marks live PSP as ready when live payments disabled', () => {
    const result = computeMarketReadiness({ ...base, livePaymentEnabled: false });
    expect(result.external_gates).toEqual(
      expect.arrayContaining([
        'LIVE_PSP_EXTERNAL_GATED',
        'LIVE_CARRIER_EXTERNAL_GATED',
        'LIVE_MESSAGING_EXTERNAL_GATED',
      ]),
    );
  });

  it('returns ACTIVE when country is active and config complete', () => {
    expect(computeMarketReadiness({ ...base, countryStatus: 'ACTIVE' }).readiness).toBe('ACTIVE');
  });

  it('maps legacy aliases', () => {
    expect(legacyReadinessAlias('READY_FOR_SANDBOX')).toBe('SANDBOX_READY');
    expect(legacyReadinessAlias('READY_FOR_ACTIVATION')).toBe('PRODUCTION_READY');
    expect(legacyReadinessAlias('NOT_READY')).toBe('DRAFT');
  });

  it('parses pack payment and shipping signals', () => {
    const parsed = parsePolicyCommerceSignals({
      currency: { default: 'xxx' },
      payments: { enabled: true, methods: ['CARD'], currencies: ['XXX'] },
      shipping: { domestic: true },
    });
    expect(parsed.paymentPolicyConfigured).toBe(true);
    expect(parsed.deliveryPolicyConfigured).toBe(true);
    expect(parsed.currencyFromPack).toBe('XXX');
  });
});

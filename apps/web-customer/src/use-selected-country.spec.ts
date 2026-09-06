import { clampStoreCountry, isStoreMarket } from './use-selected-country';

describe('store market country', () => {
  it('accepts IN, AE, and US', () => {
    expect(isStoreMarket('in')).toBe(true);
    expect(isStoreMarket('AE')).toBe(true);
    expect(isStoreMarket('US')).toBe(true);
  });

  it('returns null for unsupported markets instead of silently defaulting to IN', () => {
    expect(clampStoreCountry('DE')).toBeNull();
    expect(clampStoreCountry('XX')).toBeNull();
    expect(clampStoreCountry('')).toBeNull();
    expect(clampStoreCountry('gb')).toBeNull();
  });

  it('normalizes supported markets', () => {
    expect(clampStoreCountry('ae')).toBe('AE');
    expect(clampStoreCountry('us')).toBe('US');
    expect(clampStoreCountry('IN')).toBe('IN');
  });

  it('uses explicit fallback when provided', () => {
    expect(clampStoreCountry('DE', 'AE')).toBe('AE');
    expect(clampStoreCountry('', 'US')).toBe('US');
  });

  it('blocks empty country from being treated as ready for API', () => {
    expect(isStoreMarket('')).toBe(false);
    expect(isStoreMarket(undefined)).toBe(false);
    expect(isStoreMarket(null)).toBe(false);
  });
});

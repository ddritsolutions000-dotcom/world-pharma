import {
  affiliateCodeForCheckout,
  clearAffiliateAttribution,
  newClickId,
  readAffiliateAttribution,
  writeAffiliateAttribution,
} from './affiliate-attribution';

describe('affiliate attribution storage', () => {
  beforeEach(() => {
    clearAffiliateAttribution();
  });

  it('round-trips attribution without PHI', () => {
    writeAffiliateAttribution({
      referral_code: 'SAVE10',
      click_id: 'click-1',
      link_id: 'link-1',
      country_code: 'XX',
      recorded_at: new Date().toISOString(),
    });
    expect(readAffiliateAttribution()?.referral_code).toBe('SAVE10');
  });

  it('returns checkout code for matching country', () => {
    writeAffiliateAttribution({
      referral_code: 'SAVE10',
      click_id: 'click-1',
      country_code: 'XX',
      recorded_at: new Date().toISOString(),
    });
    expect(affiliateCodeForCheckout('XX')).toBe('SAVE10');
    expect(affiliateCodeForCheckout('YY')).toBeUndefined();
  });

  it('generates click ids', () => {
    expect(newClickId().length).toBeGreaterThan(8);
  });
});

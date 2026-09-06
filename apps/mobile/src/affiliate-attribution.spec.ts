import {
  affiliateCodeForCheckout,
  clearAffiliateAttribution,
  parseReferralCodeFromUrl,
  writeAffiliateAttribution,
} from './affiliate-attribution';

describe('mobile affiliate attribution', () => {
  beforeEach(() => {
    clearAffiliateAttribution();
  });

  it('passes stored code at checkout for matching country', () => {
    writeAffiliateAttribution({
      referral_code: 'MOB10',
      click_id: 'c1',
      country_code: 'XX',
      recorded_at: new Date().toISOString(),
    });
    expect(affiliateCodeForCheckout('XX')).toBe('MOB10');
    expect(affiliateCodeForCheckout('YY')).toBeUndefined();
  });

  it('parses referral code from deep link URL', () => {
    expect(parseReferralCodeFromUrl('worldpharma://app/r/SAVE10')).toBe('SAVE10');
    expect(parseReferralCodeFromUrl('https://customer.example/r/ABC%20123?q=1')).toBe('ABC 123');
    expect(parseReferralCodeFromUrl('https://customer.example/orders')).toBeNull();
  });
});

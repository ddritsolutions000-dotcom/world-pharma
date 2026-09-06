import { isAffiliateSandboxCountry } from './affiliate-sandbox-scope';

describe('affiliate sandbox market', () => {
  it('treats XX as intentional sandbox scope', () => {
    expect(isAffiliateSandboxCountry('XX')).toBe(true);
    expect(isAffiliateSandboxCountry('xx')).toBe(true);
  });

  it('does not treat store markets as sandbox affiliate scope', () => {
    expect(isAffiliateSandboxCountry('IN')).toBe(false);
    expect(isAffiliateSandboxCountry('AE')).toBe(false);
    expect(isAffiliateSandboxCountry('US')).toBe(false);
  });
});

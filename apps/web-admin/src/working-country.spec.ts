import {
  persistAdminCountry,
  resolveAdminWorkingCountry,
  resolveMarketCountry,
  workingCountry,
} from './working-country';

describe('admin working country', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('never silently defaults empty scope to India', () => {
    expect(workingCountry(undefined)).toBe('');
    expect(workingCountry('')).toBe('');
    expect(resolveMarketCountry(null)).toBeNull();
  });

  it('prefers URL country then storage then session', () => {
    expect(
      resolveAdminWorkingCountry({ urlCountry: 'ae', sessionCountry: 'IN' }),
    ).toBe('AE');
    expect(window.localStorage.getItem('wp_admin_country')).toBe('AE');

    expect(
      resolveAdminWorkingCountry({ urlCountry: '', sessionCountry: 'US' }),
    ).toBe('AE');

    persistAdminCountry('');
    expect(
      resolveAdminWorkingCountry({ urlCountry: null, sessionCountry: 'us' }),
    ).toBe('US');
  });

  it('leaves scope empty when nothing valid is available', () => {
    expect(
      resolveAdminWorkingCountry({ urlCountry: 'XX', sessionCountry: 'DE' }),
    ).toBe('');
  });
});

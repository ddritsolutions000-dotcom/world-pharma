import { safeInternalPath } from './safe-internal-path';

describe('safeInternalPath', () => {
  it('allows storefront paths', () => {
    expect(safeInternalPath('/checkout')).toBe('/checkout');
    expect(safeInternalPath('/login?next=/cart')).toBeNull();
  });

  it('rejects open redirects', () => {
    expect(safeInternalPath('https://evil.example')).toBeNull();
    expect(safeInternalPath('//evil.example')).toBeNull();
  });
});

import { rememberProductSlug, RECENT_PRODUCT_SLUGS_KEY } from './recently-viewed-section';

describe('recently viewed products', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps the newest slug first and caps the list', () => {
    rememberProductSlug('a');
    rememberProductSlug('b');
    rememberProductSlug('a');
    const stored = JSON.parse(window.localStorage.getItem(RECENT_PRODUCT_SLUGS_KEY) ?? '[]') as string[];
    expect(stored[0]).toBe('a');
    expect(stored).toEqual(['a', 'b']);
  });
});

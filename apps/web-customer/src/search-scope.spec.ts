import { parseSearchScope, searchResultsHref, SEARCH_SCOPES } from './search-scope';

describe('search scope', () => {
  it('builds search URLs with optional tab', () => {
    expect(searchResultsHref('para')).toBe('/search?q=para');
    expect(searchResultsHref('lipid', 'test')).toBe('/search?q=lipid&tab=test');
    expect(searchResultsHref('  ')).toBe('/');
  });

  it('parses SERP tab aliases', () => {
    expect(parseSearchScope('doctor')).toBe('doctor');
    expect(parseSearchScope('lab')).toBe('test');
    expect(parseSearchScope('pet')).toBe('all');
  });

  it('lists header search scopes', () => {
    expect(SEARCH_SCOPES.map((s) => s.id)).toEqual(['all', 'commerce', 'test', 'doctor']);
  });
});

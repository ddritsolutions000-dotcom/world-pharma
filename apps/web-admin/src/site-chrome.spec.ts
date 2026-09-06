import { isNavSectionActive, parseSiteHero, parseSiteNav, sanitizeHref, SITE_CHROME_SLUGS } from '@world-pharma/shared/site-chrome';

describe('site chrome', () => {
  it('rejects javascript hrefs', () => {
    expect(sanitizeHref('javascript:alert(1)')).toBeNull();
    expect(sanitizeHref('/help')).toBe('/help');
  });

  it('parses nav labels from JSON and falls back on junk', () => {
    const parsed = parseSiteNav(
      JSON.stringify({
        version: 1,
        topStrip: [],
        sections: [{ id: 'shop', label: 'Medicines', href: '/', enabled: true }],
      }),
    );
    expect(parsed.sections[0]?.label).toBe('Medicines');
    expect(parseSiteNav('not-json').sections[0]?.label).toBe('Shop');
  });

  it('parses homepage shortcuts from JSON', () => {
    const parsed = parseSiteHero(
      JSON.stringify({
        shortcuts: [{ href: '/lab', label: 'Labs', sub: 'HOME', bg: '#eee', icon: '🧪' }],
      }),
    );
    expect(parsed.shortcuts[0]?.label).toBe('Labs');
    expect(parseSiteHero('not-json').rails[0]?.id).toBe('shortcuts');
  });

  it('marks healthcare prefixes active', () => {
    const nav = parseSiteNav(null);
    const healthcare = nav.sections.find((row) => row.id === 'healthcare');
    expect(healthcare).toBeDefined();
    expect(isNavSectionActive(healthcare!, '/reminders')).toBe(true);
    expect(isNavSectionActive(healthcare!, '/lab/packages')).toBe(true);
  });

  it('lists reserved chrome slugs', () => {
    expect(SITE_CHROME_SLUGS).toContain('site-nav');
    expect(SITE_CHROME_SLUGS).toContain('site-seo');
  });
});

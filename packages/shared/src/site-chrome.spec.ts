import {
  DEFAULT_CATEGORY_RAIL,
  isNavSectionActive,
  parseSiteNav,
  parseSiteSeo,
  sanitizeHref,
  SITE_CHROME_SLUGS,
} from './site-chrome';

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
    expect(parseSiteNav('not-json').sections[0]?.label).toBe('Medicines');
  });

  it('marks healthcare prefixes active', () => {
    const nav = parseSiteNav(null);
    const healthcare = nav.sections.find((row) => row.id === 'healthcare');
    expect(healthcare).toBeDefined();
    expect(isNavSectionActive(healthcare!, '/reminders')).toBe(true);
    expect(isNavSectionActive(healthcare!, '/lab/packages')).toBe(true);
  });

  it('includes a World-Pharma category rail', () => {
    expect(DEFAULT_CATEGORY_RAIL.map((row) => row.label)).toEqual(
      expect.arrayContaining(['Medicines', 'Lab Tests', 'Imaging', 'Doctors', 'Chronic Care', 'Corporate', 'Global Access']),
    );
  });

  it('lists reserved chrome slugs', () => {
    expect(SITE_CHROME_SLUGS).toContain('site-nav');
    expect(SITE_CHROME_SLUGS).toContain('site-seo');
  });

  it('parses organization JSON-LD fields and drops javascript URLs', () => {
    const parsed = parseSiteSeo(
      JSON.stringify({
        version: 1,
        organizationName: 'Acme Health',
        organizationUrl: 'javascript:alert(1)',
      }),
    );
    expect(parsed.organizationName).toBe('Acme Health');
    expect(parsed.organizationUrl).toBe('');
  });
});

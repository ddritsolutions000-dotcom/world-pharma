import { LEGAL_SITE_PAGES } from './legal-page-catalog';

describe('legal page catalog', () => {
  it('uses the slugs customer CmsPage already loads', () => {
    expect(LEGAL_SITE_PAGES.map((page) => page.slug)).toEqual([
      'privacy-policy',
      'terms-and-conditions',
      'return-policy',
      'about-worldpharma',
      'careers-at-worldpharma',
    ]);
  });
});

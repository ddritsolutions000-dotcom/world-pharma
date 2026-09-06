import { ADMIN_NAV } from './nav';

/** Every admin API surface that operators can open from the sidebar. */
const ADMIN_API_SIDEBAR_HREFS = [
  '/catalog',
  '/inventory',
  '/payments',
  '/orders',
  '/logistics',
  '/delivery',
  '/finance',
  '/marketplace',
  '/search',
  '/doctors',
  '/labs',
  '/imaging',
  '/appointments',
  '/prescriptions',
  '/dispensing',
  '/refills',
  '/video-sessions',
  '/care-plans',
  '/health-packages',
  '/speciality-care',
  '/corporate',
  '/substitutes',
  '/serviceability',
  '/store-locator',
  '/identity',
  '/company-authority',
  '/policy-packs',
  '/organizations',
  '/partners',
  '/regions',
  '/legal-entities',
  '/business-units',
  '/audit',
  '/governance/health/consents',
  '/governance/health/access-audits',
  '/governance/health/break-glass',
  '/governance/care-nav',
  '/cms',
  '/cms/blog',
  '/cms/legal',
  '/cms/faq',
  '/cms/health',
  '/cms/pages',
  '/cms/media',
  '/storefront',
  '/seo',
  '/notifications',
  '/support',
  '/crm',
  '/crm/automation',
  '/marketing',
  '/analytics',
  '/promo',
  '/loyalty',
  '/affiliates',
  '/reviews',
] as const;

describe('admin sidebar coverage', () => {
  it('exposes a sidebar item for every operator API console', () => {
    const hrefs = new Set(ADMIN_NAV.map((item) => item.href));
    for (const href of ADMIN_API_SIDEBAR_HREFS) {
      expect(hrefs.has(href)).toBe(true);
    }
  });
});

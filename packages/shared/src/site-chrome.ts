export const SITE_NAV_SLUG = 'site-nav';
export const SITE_FOOTER_SLUG = 'site-footer';
export const SITE_HERO_SLUG = 'site-hero';
export const SITE_SEO_SLUG = 'site-seo';

export const SITE_CHROME_SLUGS = [SITE_NAV_SLUG, SITE_FOOTER_SLUG, SITE_HERO_SLUG, SITE_SEO_SLUG] as const;

export type SiteLink = {
  href: string;
  label: string;
  description?: string;
  icon?: string;
};

export type SiteNavColumn = {
  title: string;
  links: SiteLink[];
};

export type SiteNavSection = {
  id: string;
  label: string;
  href?: string;
  enabled: boolean;
  featured?: SiteLink[];
  columns?: SiteNavColumn[];
  activePrefixes?: string[];
};

export type SiteNavDocument = {
  version: 1;
  topStrip: SiteLink[];
  sections: SiteNavSection[];
};

export type SiteFooterColumn = {
  title: string;
  links: SiteLink[];
  source?: 'categories' | 'services';
};

export type SiteFooterDocument = {
  version: 1;
  tagline: string;
  copyright: string;
  disclaimer: string;
  partnerLabel: string;
  partnerHref: string;
  appTitle: string;
  appLinks: SiteLink[];
  payments: string[];
  trust: Array<{ icon: string; label: string }>;
  columns: SiteFooterColumn[];
};

export type SiteShortcut = {
  href: string;
  label: string;
  sub: string;
  bg: string;
  icon: string;
};

export type SiteHeroDocument = {
  version: 1;
  promoKicker: string;
  promoTitle: string;
  promoSub: string;
  rxTitle: string;
  rxBody: string;
  rxCta: string;
  rxHref: string;
  consultKicker: string;
  consultTitle: string;
  consultBody: string;
  consultLinks: SiteLink[];
  stats: Array<{ value: string; label: string }>;
  shortcuts: SiteShortcut[];
  rails: HomeRail[];
};

export type HomeRail = {
  id: string;
  label: string;
  enabled: boolean;
};

export const HOME_RAIL_CATALOG: HomeRail[] = [
  { id: 'promo', label: 'Hero banner', enabled: true },
  { id: 'shortcuts', label: 'Service shortcuts', enabled: false },
  { id: 'consult', label: 'Consult banner', enabled: false },
  { id: 'offers', label: 'Offers banner', enabled: false },
  { id: 'rx', label: 'Prescription banner', enabled: true },
  { id: 'stats', label: 'Stat strip', enabled: false },
  { id: 'quickOrder', label: 'Quick order', enabled: false },
  { id: 'trending', label: 'Trending searches', enabled: false },
  { id: 'health', label: 'Health articles', enabled: true },
  { id: 'doctors', label: 'Doctors', enabled: true },
  { id: 'packages', label: 'Lab packages', enabled: true },
  { id: 'recently', label: 'Recently viewed', enabled: false },
  { id: 'concerns', label: 'Health concerns', enabled: false },
  { id: 'pet', label: 'Pet care', enabled: false },
  { id: 'cancer', label: 'Cancer care', enabled: false },
  { id: 'ayurveda', label: 'Ayurveda', enabled: false },
  { id: 'combo', label: 'Combo packs', enabled: false },
  { id: 'labs', label: 'Lab tests', enabled: true },
  { id: 'brands', label: 'Brands', enabled: true },
  { id: 'deals', label: 'Deals', enabled: true },
  { id: 'categories', label: 'Categories', enabled: true },
  { id: 'medicines', label: 'Medicines grid', enabled: true },
  { id: 'extra', label: 'Extra modules', enabled: false },
];

export type SiteRedirect = {
  from: string;
  to: string;
  status: 301 | 302;
};

export type SiteSeoDocument = {
  version: 1;
  siteTitle: string;
  defaultDescription: string;
  ogTitle: string;
  ogDescription: string;
  robotsTxt: string;
  noindexPaths: string[];
  redirects: SiteRedirect[];
  organizationName: string;
  organizationUrl: string;
};

export function sanitizeHref(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const href = raw.trim();
  if (!href || href.length > 500) {
    return null;
  }
  const lower = href.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) {
    return null;
  }
  if (href.startsWith('/') || lower.startsWith('https://') || lower.startsWith('http://') || lower.startsWith('mailto:')) {
    return href;
  }
  return null;
}

export function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  if (prefix === '/') {
    return pathname === '/';
  }
  if (prefix.endsWith('/')) {
    return pathname === prefix.slice(0, -1) || pathname.startsWith(prefix);
  }
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isNavSectionActive(section: SiteNavSection, pathname: string): boolean {
  if (section.href && pathMatchesPrefix(pathname, section.href)) {
    return true;
  }
  for (const prefix of section.activePrefixes ?? []) {
    if (pathMatchesPrefix(pathname, prefix)) {
      return true;
    }
  }
  for (const item of section.featured ?? []) {
    if (pathMatchesPrefix(pathname, item.href)) {
      return true;
    }
  }
  for (const col of section.columns ?? []) {
    for (const link of col.links) {
      if (pathMatchesPrefix(pathname, link.href)) {
        return true;
      }
    }
  }
  return false;
}

function asLink(raw: unknown): SiteLink | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const href = sanitizeHref(row.href);
  const label = typeof row.label === 'string' ? row.label.trim() : '';
  if (!href || !label) {
    return null;
  }
  const link: SiteLink = { href, label };
  if (typeof row.description === 'string' && row.description.trim()) {
    link.description = row.description.trim();
  }
  if (typeof row.icon === 'string' && row.icon.trim()) {
    link.icon = row.icon.trim();
  }
  return link;
}

function parseJsonObject(body: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const DEFAULT_CATEGORY_RAIL: SiteShortcut[] = [
  { href: '/', label: 'Medicines', sub: 'OTC & Rx', bg: '#E8EEF8', icon: '💊' },
  { href: '/lab', label: 'Lab Tests', sub: 'At home', bg: '#E0F2FE', icon: '🧪' },
  { href: '/radiology', label: 'Imaging', sub: 'X-ray & MRI', bg: '#EEF2FF', icon: '🩻' },
  { href: '/doctors', label: 'Doctors', sub: 'Consult', bg: '#CCFBF1', icon: '🩺' },
  { href: '/categories', label: 'Health products', sub: 'Wellness', bg: '#F3E8FF', icon: '🧴' },
  { href: '/ayurveda', label: 'Ayurveda', sub: 'Natural', bg: '#ECFDF5', icon: '🌿' },
  { href: '/care-plan', label: 'Care Plans', sub: 'Save more', bg: '#FEF3C7', icon: '💚' },
  { href: '/cancer-care', label: 'Chronic Care', sub: 'Support', bg: '#FCE7F3', icon: '🎗️' },
  { href: '/corporate', label: 'Corporate', sub: 'Workplace', bg: '#D1FAE5', icon: '🏢' },
  { href: '/services', label: 'Global Access', sub: 'Worldwide', bg: '#DBEAFE', icon: '🌍' },
];

export const DEFAULT_SITE_NAV: SiteNavDocument = {
  version: 1,
  topStrip: [
    { href: '/care-plan', label: 'Care Plan' },
    { href: '/pharmacist', label: 'Ask a pharmacist' },
    { href: '/deals', label: 'Offers' },
    { href: '/download', label: 'Download App' },
    { href: '/prescriptions', label: 'Order with Prescription' },
  ],
  sections: [
    {
      id: 'shop',
      label: 'Medicines',
      enabled: true,
      activePrefixes: [
        '/',
        '/p',
        '/c',
        '/categories',
        '/search',
        '/deals',
        '/brands',
        '/recommendations',
        '/buy-again',
        '/salts',
        '/pharmacist',
      ],
      featured: [
        { href: '/', label: 'Medicines', description: 'OTC & Rx from licensed partners', icon: '💊' },
        { href: '/deals', label: 'Offers', description: 'Discounts on popular SKUs', icon: '🏷️' },
        { href: '/prescriptions', label: 'Upload Rx', description: 'We verify and arrange delivery', icon: '📄' },
        { href: '/track-order', label: 'Track order', description: 'Home delivery status', icon: '🚚' },
      ],
      columns: [
        {
          title: 'Pharmacy',
          links: [
            { href: '/', label: 'All medicines', description: 'OTC & prescription', icon: '💊' },
            { href: '/deals', label: 'Offers & deals', icon: '🏷️' },
            { href: '/brands', label: 'Featured brands', icon: '⭐' },
            { href: '/recommendations', label: 'For you', icon: '✨' },
            { href: '/salts', label: 'Salt / composition index', icon: '🧪' },
          ],
        },
        {
          title: 'Quick actions',
          links: [
            { href: '/prescriptions', label: 'Upload prescription', icon: '📄' },
            { href: '/pharmacist', label: 'Ask a pharmacist', icon: '👩‍⚕️' },
            { href: '/buy-again', label: 'Buy again', icon: '🔁' },
            { href: '/subscriptions', label: 'Medicine subscriptions', icon: '📦' },
            { href: '/cart', label: 'Cart', icon: '🛒' },
            { href: '/orders', label: 'My orders', icon: '🚚' },
          ],
        },
      ],
    },
    {
      id: 'healthcare',
      label: 'Lab & doctors',
      enabled: true,
      activePrefixes: [
        '/lab',
        '/radiology',
        '/doctors',
        '/appointments',
        '/health',
        '/reminders',
        '/family',
        '/subscriptions',
        '/prescriptions',
        '/care-plan',
        '/corporate',
        '/programs',
      ],
      featured: [
        { href: '/lab', label: 'Lab tests', description: 'Home sample collection', icon: '🧪' },
        { href: '/doctors', label: 'Doctors', description: 'Online consults', icon: '🩺' },
        { href: '/radiology', label: 'Scans', description: 'X-ray, MRI & more', icon: '🩻' },
        { href: '/care-plan', label: 'Care Plan', description: 'Savings on medicines', icon: '💚' },
      ],
      columns: [
        {
          title: 'Diagnostics',
          links: [
            { href: '/lab', label: 'Lab tests', icon: '🧪' },
            { href: '/lab/packages', label: 'Full body checkups', icon: '📋' },
            { href: '/lab/bookings', label: 'My lab bookings', icon: '📅' },
            { href: '/radiology', label: 'X-rays & scans', icon: '🩻' },
          ],
        },
        {
          title: 'Consult & records',
          links: [
            { href: '/doctors', label: 'Consult doctors', icon: '🩺' },
            { href: '/appointments', label: 'My appointments', icon: '🗓️' },
            { href: '/health', label: 'Health records', icon: '📁' },
            { href: '/reminders', label: 'Medicine reminders', icon: '⏰' },
            { href: '/family', label: 'Family members', icon: '👨‍👩‍👧' },
            { href: '/subscriptions', label: 'Medicine subscriptions', icon: '📦' },
            { href: '/care-plan', label: 'Care Plan', icon: '💚' },
            { href: '/corporate', label: 'Corporate wellness', icon: '🏢' },
            { href: '/programs', label: 'Speciality programs', icon: '🎗️' },
          ],
        },
      ],
    },
    {
      id: 'specialty',
      label: 'Ayurveda',
      enabled: true,
      activePrefixes: ['/pet-care', '/cancer-care', '/ayurveda', '/vaccines', '/programs'],
      featured: [
        { href: '/ayurveda', label: 'Ayurveda', description: 'Herbs & homeopathy', icon: '🌿' },
        { href: '/pet-care', label: 'Pet Care', description: 'Medicines for dogs & cats', icon: '🐾' },
        { href: '/cancer-care', label: 'Cancer Care', description: 'Support meds & nutrition', icon: '🎗️' },
        { href: '/vaccines', label: 'Vaccines', description: 'Adult immunisation', icon: '💉' },
      ],
      columns: [
        {
          title: 'Specialty care',
          links: [
            { href: '/pet-care', label: 'Pet Care', icon: '🐾' },
            { href: '/cancer-care', label: 'Cancer Care shop', icon: '🎗️' },
            { href: '/programs/cancer-care', label: 'Cancer Care program', icon: '🏥' },
            { href: '/programs/diabetes-care', label: 'Diabetes program', icon: '🩸' },
            { href: '/programs/cardiac-care', label: 'Heart program', icon: '❤️' },
            { href: '/programs/obesity-management', label: 'Obesity program', icon: '⚖️' },
            { href: '/ayurveda', label: 'Ayurveda & Homeopathy', icon: '🌿' },
            { href: '/vaccines', label: 'Adult Vaccines', icon: '💉' },
            { href: '/programs/vaccination-program', label: 'Vaccination program', icon: '🛡️' },
            { href: '/programs', label: 'All programs', icon: '📚' },
          ],
        },
      ],
    },
    { id: 'help', label: 'Help', href: '/help', enabled: true, activePrefixes: ['/help'] },
    { id: 'track', label: 'Track order', href: '/track-order', enabled: true, activePrefixes: ['/track-order', '/shipments'] },
  ],
};

export const SITE_SERVICES: SiteLink[] = [
  { href: '/', label: 'Order Medicines', icon: '💊', description: 'Pharmacy products delivered in your country.' },
  { href: '/prescriptions', label: 'Upload Prescription', icon: '📄', description: 'Send an Rx and get medicines filled by licensed partners.' },
  { href: '/lab', label: 'Book Lab Tests', icon: '🧪', description: 'Home collection and diagnostic lab bookings.' },
  { href: '/lab/packages', label: 'Full body checkups', icon: '📋', description: 'Health packages and preventive screening.' },
  { href: '/doctors', label: 'Consult Doctors', icon: '👨‍⚕️', description: 'Online consultations with licensed clinicians.' },
  { href: '/radiology', label: 'X-Rays & Scans', icon: '🩻', description: 'Book imaging and track radiology reports.' },
  { href: '/programs', label: 'Speciality programs', icon: '🏥', description: 'Guided care programs for chronic conditions.' },
  { href: '/care-plan', label: 'Care Plan', icon: '💚', description: 'Ongoing care plans and follow-up support.' },
  { href: '/corporate', label: 'Corporate wellness', icon: '🏢', description: 'Workplace health and employee wellness.' },
  { href: '/pet-care', label: 'Pet Care', icon: '🐾', description: 'Veterinary medicines and pet health products.' },
  { href: '/cancer-care', label: 'Cancer Care', icon: '🎗️', description: 'Oncology support, medicines, and care navigation.' },
  { href: '/ayurveda', label: 'Ayurveda & Homeopathy', icon: '🌿', description: 'Traditional and wellness product ranges.' },
  { href: '/vaccines', label: 'Adult Vaccines', icon: '💉', description: 'Adult immunization bookings and information.' },
  { href: '/salts', label: 'Salt index', icon: '🔬', description: 'Look up salts, substitutes, and compositions.' },
  { href: '/track-order', label: 'Track Order', icon: '📦', description: 'Check pharmacy order status in real time.' },
  { href: '/shipments', label: 'Track Delivery', icon: '🚚', description: 'Follow shipment and last-mile delivery.' },
];

export const FOOTER_SERVICE_PREVIEW_COUNT = 6;
export const VIEW_ALL_SERVICES_LINK: SiteLink = { href: '/services', label: 'View all services →' };

export function isServicesFooterColumn(column: Pick<SiteFooterColumn, 'title' | 'source'>): boolean {
  return column.source === 'services' || /^our services$/i.test(column.title.trim());
}

export function footerServicePreviewLinks(_column?: Pick<SiteFooterColumn, 'links'>): SiteLink[] {
  return [
    ...SITE_SERVICES.slice(0, FOOTER_SERVICE_PREVIEW_COUNT).map((link) => ({
      href: link.href,
      label: link.label,
    })),
    VIEW_ALL_SERVICES_LINK,
  ];
}

export const DEFAULT_SITE_FOOTER: SiteFooterDocument = {
  version: 1,
  tagline:
    'World Pharma — global online pharmacy & healthcare platform. Medicines, lab tests, and doctor consultations, delivered in your country.',
  copyright: 'WorldPharma. All rights reserved.',
  disclaimer:
    'WorldPharma is a technology platform connecting customers with licensed pharmacies, doctors, and diagnostic labs. Always consult a physician before taking any medicine.',
  partnerLabel: 'Partner with us →',
  partnerHref: '/partners',
  appTitle: 'Download the App',
  appLinks: [
    { href: '/download', label: 'Google Play' },
    { href: '/download', label: 'App Store' },
  ],
  payments: ['Visa', 'Mastercard', 'Amex', 'PayPal', 'Apple Pay', 'Google Pay', 'COD'],
  trust: [
    { icon: '✓', label: '100% Genuine Medicines' },
    { icon: '🚚', label: 'Worldwide delivery' },
    { icon: '👨‍⚕️', label: 'Licensed Doctors' },
    { icon: '🧪', label: 'Accredited diagnostic labs' },
    { icon: '🔒', label: 'Secure Payments' },
  ],
  columns: [
    {
      title: 'Know Us',
      links: [
        { href: '/about', label: 'About WorldPharma' },
        { href: '/contact', label: 'Contact Us' },
        { href: '/careers', label: 'Careers' },
        { href: '/blog', label: 'Health Blog' },
      ],
    },
    {
      title: 'Our Services',
      source: 'services',
      links: footerServicePreviewLinks(),
    },
    { title: 'Shop Categories', links: [{ href: '/categories', label: 'Browse categories' }], source: 'categories' },
    {
      title: 'Need Help',
      links: [
        { href: '/help', label: 'Help Centre' },
        { href: '/pharmacist', label: 'Ask a pharmacist' },
        { href: '/help/search', label: 'FAQs & Search' },
        { href: '/contact', label: 'Customer Support' },
        { href: '/account', label: 'My Account' },
        { href: '/orders', label: 'My Orders' },
      ],
    },
    {
      title: 'Policy Info',
      links: [
        { href: '/legal/privacy', label: 'Privacy Policy' },
        { href: '/legal/terms', label: 'Terms & Conditions' },
        { href: '/legal/returns', label: 'Return Policy' },
        { href: '/account/consent', label: 'Consent Settings' },
      ],
    },
  ],
};

export const DEFAULT_SITE_HERO: SiteHeroDocument = {
  version: 1,
  promoKicker: 'World-Pharma™ · Global Healthcare. For a Healthier Tomorrow.',
  promoTitle: 'Health for People Everywhere.',
  promoSub:
    'Licensed pharmacies, home sample collection, imaging bookings, and verified consults with tracked delivery in your country.',
  rxTitle: 'Order with prescription',
  rxBody: "Upload your Rx — we'll verify and arrange genuine medicines for delivery.",
  rxCta: 'Upload now',
  rxHref: '/prescriptions',
  consultKicker: 'Online doctor consult',
  consultTitle: 'Talk to a verified doctor in minutes',
  consultBody: 'General physicians and specialists — digital prescription to your account when eligible.',
  consultLinks: [
    { href: '/doctors', label: 'Consult now' },
    { href: '/lab', label: 'Book a lab test' },
    { href: '/radiology', label: 'Book a scan' },
  ],
  stats: [
    { value: '50K+', label: 'Products listed' },
    { value: '500+', label: 'Partner labs' },
    { value: '2K+', label: 'Verified doctors' },
    { value: '120+', label: 'Countries served' },
  ],
  shortcuts: [],
  rails: HOME_RAIL_CATALOG,
};

export const DEFAULT_SITE_SEO: SiteSeoDocument = {
  version: 1,
  siteTitle: 'World Pharma — Medicines, Doctors & Lab Tests',
  defaultDescription: 'Order medicines, book doctors, and schedule lab tests with home delivery.',
  ogTitle: 'World Pharma',
  ogDescription: 'Medicines, doctors, and lab tests — one account.',
  robotsTxt: `User-agent: *
Allow: /
Disallow: /account
Disallow: /checkout
Disallow: /login
`,
  noindexPaths: ['/account', '/checkout', '/login'],
  redirects: [],
  organizationName: 'World Pharma',
  organizationUrl: '',
};

export function parseSiteNav(body: string | null | undefined): SiteNavDocument {
  const parsed = body ? parseJsonObject(body) : null;
  if (!parsed) {
    return DEFAULT_SITE_NAV;
  }
  const topStrip = Array.isArray(parsed.topStrip)
    ? parsed.topStrip.map(asLink).filter((row): row is SiteLink => Boolean(row))
    : DEFAULT_SITE_NAV.topStrip;
  const sections = Array.isArray(parsed.sections)
    ? parsed.sections
        .map((raw) => {
          if (!raw || typeof raw !== 'object') {
            return null;
          }
          const row = raw as Record<string, unknown>;
          const id = typeof row.id === 'string' ? row.id.trim() : '';
          const label = typeof row.label === 'string' ? row.label.trim() : '';
          if (!id || !label) {
            return null;
          }
          const href = row.href ? sanitizeHref(row.href) ?? undefined : undefined;
          const featured = Array.isArray(row.featured)
            ? row.featured.map(asLink).filter((item): item is SiteLink => Boolean(item))
            : undefined;
          const columns = Array.isArray(row.columns)
            ? row.columns
                .map((colRaw) => {
                  if (!colRaw || typeof colRaw !== 'object') {
                    return null;
                  }
                  const col = colRaw as Record<string, unknown>;
                  const title = typeof col.title === 'string' ? col.title.trim() : '';
                  const links = Array.isArray(col.links)
                    ? col.links.map(asLink).filter((item): item is SiteLink => Boolean(item))
                    : [];
                  if (!title) {
                    return null;
                  }
                  return { title, links };
                })
                .filter((col): col is SiteNavColumn => Boolean(col))
            : undefined;
          const activePrefixes = Array.isArray(row.activePrefixes)
            ? row.activePrefixes.filter((item): item is string => typeof item === 'string' && item.startsWith('/'))
            : undefined;
          const section: SiteNavSection = { id, label, enabled: row.enabled !== false };
          if (href) {
            section.href = href;
          }
          if (featured) {
            section.featured = featured;
          }
          if (columns) {
            section.columns = columns;
          }
          if (activePrefixes) {
            section.activePrefixes = activePrefixes;
          }
          return section;
        })
        .filter((row): row is SiteNavSection => Boolean(row))
    : DEFAULT_SITE_NAV.sections;
  return {
    version: 1,
    topStrip: topStrip.length ? topStrip : DEFAULT_SITE_NAV.topStrip,
    sections: sections.length ? sections : DEFAULT_SITE_NAV.sections,
  };
}

export function parseSiteFooter(body: string | null | undefined): SiteFooterDocument {
  const parsed = body ? parseJsonObject(body) : null;
  if (!parsed) {
    return DEFAULT_SITE_FOOTER;
  }
  const columns = Array.isArray(parsed.columns)
    ? parsed.columns
        .map((raw) => {
          if (!raw || typeof raw !== 'object') {
            return null;
          }
          const row = raw as Record<string, unknown>;
          const title = typeof row.title === 'string' ? row.title.trim() : '';
          const links = Array.isArray(row.links)
            ? row.links.map(asLink).filter((item): item is SiteLink => Boolean(item))
            : [];
          if (!title) {
            return null;
          }
          const column: SiteFooterColumn = { title, links };
          if (row.source === 'categories' || row.source === 'services') {
            column.source = row.source;
          }
          if (isServicesFooterColumn(column)) {
            column.source = 'services';
            column.links = footerServicePreviewLinks(column);
          }
          return column;
        })
        .filter((row): row is SiteFooterColumn => Boolean(row))
    : DEFAULT_SITE_FOOTER.columns;
  const trust = Array.isArray(parsed.trust)
    ? parsed.trust
        .map((raw) => {
          if (!raw || typeof raw !== 'object') {
            return null;
          }
          const row = raw as Record<string, unknown>;
          const label = typeof row.label === 'string' ? row.label.trim() : '';
          const icon = typeof row.icon === 'string' ? row.icon.trim() : '•';
          return label ? { icon, label } : null;
        })
        .filter((row): row is { icon: string; label: string } => Boolean(row))
    : DEFAULT_SITE_FOOTER.trust;
  return {
    version: 1,
    tagline: typeof parsed.tagline === 'string' && parsed.tagline.trim() ? parsed.tagline.trim() : DEFAULT_SITE_FOOTER.tagline,
    copyright:
      typeof parsed.copyright === 'string' && parsed.copyright.trim()
        ? parsed.copyright.trim()
        : DEFAULT_SITE_FOOTER.copyright,
    disclaimer:
      typeof parsed.disclaimer === 'string' && parsed.disclaimer.trim()
        ? parsed.disclaimer.trim()
        : DEFAULT_SITE_FOOTER.disclaimer,
    partnerLabel:
      typeof parsed.partnerLabel === 'string' && parsed.partnerLabel.trim()
        ? parsed.partnerLabel.trim()
        : DEFAULT_SITE_FOOTER.partnerLabel,
    partnerHref: sanitizeHref(parsed.partnerHref) ?? DEFAULT_SITE_FOOTER.partnerHref,
    appTitle:
      typeof parsed.appTitle === 'string' && parsed.appTitle.trim() ? parsed.appTitle.trim() : DEFAULT_SITE_FOOTER.appTitle,
    appLinks: Array.isArray(parsed.appLinks)
      ? parsed.appLinks.map(asLink).filter((row): row is SiteLink => Boolean(row))
      : DEFAULT_SITE_FOOTER.appLinks,
    payments: Array.isArray(parsed.payments)
      ? parsed.payments.filter((row): row is string => typeof row === 'string' && row.trim().length > 0)
      : DEFAULT_SITE_FOOTER.payments,
    trust: trust.length ? trust : DEFAULT_SITE_FOOTER.trust,
    columns: columns.length ? columns : DEFAULT_SITE_FOOTER.columns,
  };
}

export function parseSiteHero(body: string | null | undefined): SiteHeroDocument {
  const parsed = body ? parseJsonObject(body) : null;
  if (!parsed) {
    return DEFAULT_SITE_HERO;
  }
  const stats = Array.isArray(parsed.stats)
    ? parsed.stats
        .map((raw) => {
          if (!raw || typeof raw !== 'object') {
            return null;
          }
          const row = raw as Record<string, unknown>;
          const value = typeof row.value === 'string' ? row.value.trim() : '';
          const label = typeof row.label === 'string' ? row.label.trim() : '';
          return value && label ? { value, label } : null;
        })
        .filter((row): row is { value: string; label: string } => Boolean(row))
    : DEFAULT_SITE_HERO.stats;
  return {
    version: 1,
    promoKicker:
      typeof parsed.promoKicker === 'string' && parsed.promoKicker.trim()
        ? parsed.promoKicker.trim()
        : DEFAULT_SITE_HERO.promoKicker,
    promoTitle:
      typeof parsed.promoTitle === 'string' && parsed.promoTitle.trim()
        ? parsed.promoTitle.trim()
        : DEFAULT_SITE_HERO.promoTitle,
    promoSub:
      typeof parsed.promoSub === 'string' && parsed.promoSub.trim() ? parsed.promoSub.trim() : DEFAULT_SITE_HERO.promoSub,
    rxTitle: typeof parsed.rxTitle === 'string' && parsed.rxTitle.trim() ? parsed.rxTitle.trim() : DEFAULT_SITE_HERO.rxTitle,
    rxBody: typeof parsed.rxBody === 'string' && parsed.rxBody.trim() ? parsed.rxBody.trim() : DEFAULT_SITE_HERO.rxBody,
    rxCta: typeof parsed.rxCta === 'string' && parsed.rxCta.trim() ? parsed.rxCta.trim() : DEFAULT_SITE_HERO.rxCta,
    rxHref: sanitizeHref(parsed.rxHref) ?? DEFAULT_SITE_HERO.rxHref,
    consultKicker:
      typeof parsed.consultKicker === 'string' && parsed.consultKicker.trim()
        ? parsed.consultKicker.trim()
        : DEFAULT_SITE_HERO.consultKicker,
    consultTitle:
      typeof parsed.consultTitle === 'string' && parsed.consultTitle.trim()
        ? parsed.consultTitle.trim()
        : DEFAULT_SITE_HERO.consultTitle,
    consultBody:
      typeof parsed.consultBody === 'string' && parsed.consultBody.trim()
        ? parsed.consultBody.trim()
        : DEFAULT_SITE_HERO.consultBody,
    consultLinks: Array.isArray(parsed.consultLinks)
      ? parsed.consultLinks.map(asLink).filter((row): row is SiteLink => Boolean(row))
      : DEFAULT_SITE_HERO.consultLinks,
    stats: stats.length ? stats : DEFAULT_SITE_HERO.stats,
    // Home icon strip removed from customer web — ignore CMS shortcuts.
    shortcuts: [],
    rails: parseHomeRails(parsed.rails),
  };
}

function parseHomeRails(raw: unknown): HomeRail[] {
  const known = new Map(HOME_RAIL_CATALOG.map((row) => [row.id, row]));
  const source = Array.isArray(raw) ? raw : HOME_RAIL_CATALOG;
  const seen = new Set<string>();
  const out: HomeRail[] = [];
  for (const item of source) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const catalog = known.get(id);
    if (!catalog || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push({ id, label: catalog.label, enabled: catalog.enabled });
  }
  for (const catalog of HOME_RAIL_CATALOG) {
    if (!seen.has(catalog.id)) {
      out.push(catalog);
    }
  }
  const promo = out.find((row) => row.id === 'promo');
  if (!promo) {
    return out;
  }
  return [promo, ...out.filter((row) => row.id !== 'promo')];
}

export function parseSiteSeo(body: string | null | undefined): SiteSeoDocument {
  const parsed = body ? parseJsonObject(body) : null;
  if (!parsed) {
    return DEFAULT_SITE_SEO;
  }
  const redirects = Array.isArray(parsed.redirects)
    ? parsed.redirects
        .map((raw) => {
          if (!raw || typeof raw !== 'object') {
            return null;
          }
          const row = raw as Record<string, unknown>;
          const from = sanitizeHref(row.from);
          const to = sanitizeHref(row.to);
          if (!from || !to || !from.startsWith('/') || from.includes('://')) {
            return null;
          }
          return {
            from,
            to,
            status: row.status === 302 ? (302 as const) : (301 as const),
          };
        })
        .filter((row): row is SiteRedirect => Boolean(row))
    : [];
  const robotsTxt =
    typeof parsed.robotsTxt === 'string' && parsed.robotsTxt.trim()
      ? parsed.robotsTxt.replace(/<script/gi, '')
      : DEFAULT_SITE_SEO.robotsTxt;
  return {
    version: 1,
    siteTitle:
      typeof parsed.siteTitle === 'string' && parsed.siteTitle.trim()
        ? parsed.siteTitle.trim()
        : DEFAULT_SITE_SEO.siteTitle,
    defaultDescription:
      typeof parsed.defaultDescription === 'string' && parsed.defaultDescription.trim()
        ? parsed.defaultDescription.trim()
        : DEFAULT_SITE_SEO.defaultDescription,
    ogTitle: typeof parsed.ogTitle === 'string' && parsed.ogTitle.trim() ? parsed.ogTitle.trim() : DEFAULT_SITE_SEO.ogTitle,
    ogDescription:
      typeof parsed.ogDescription === 'string' && parsed.ogDescription.trim()
        ? parsed.ogDescription.trim()
        : DEFAULT_SITE_SEO.ogDescription,
    robotsTxt,
    noindexPaths: Array.isArray(parsed.noindexPaths)
      ? parsed.noindexPaths.filter((row): row is string => typeof row === 'string' && row.startsWith('/'))
      : DEFAULT_SITE_SEO.noindexPaths,
    redirects,
    organizationName:
      typeof parsed.organizationName === 'string' && parsed.organizationName.trim()
        ? parsed.organizationName.trim().slice(0, 200)
        : DEFAULT_SITE_SEO.organizationName,
    organizationUrl: (() => {
      const href = sanitizeHref(parsed.organizationUrl);
      if (!href || href.startsWith('mailto:')) {
        return '';
      }
      return href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/') ? href : '';
    })(),
  };
}

export function findRedirect(pathname: string, redirects: SiteRedirect[]): SiteRedirect | undefined {
  return redirects.find((row) => row.from === pathname);
}

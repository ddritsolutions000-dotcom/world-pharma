'use client';

/** Customer service strip — medicines, labs, imaging, doctors. */
export const PLATFORM_ECOSYSTEM_LINKS = [
  { href: '/', label: 'Medicines', match: (p: string) => p === '/' || p.startsWith('/p/') || p.startsWith('/c/') || p.startsWith('/search') || p.startsWith('/deals') },
  { href: '/lab', label: 'Lab Tests', match: (p: string) => p.startsWith('/lab') },
  { href: '/pet-care', label: 'Pet Care', match: (p: string) => p.startsWith('/pet-care') },
  { href: '/cancer-care', label: 'Cancer Care', match: (p: string) => p.startsWith('/cancer-care') },
  { href: '/ayurveda', label: 'Ayurveda', match: (p: string) => p.startsWith('/ayurveda') },
  { href: '/doctors', label: 'Consult Doctors', match: (p: string) => p.startsWith('/doctors') || p.startsWith('/appointments') },
  { href: '/radiology', label: 'Scans', match: (p: string) => p.startsWith('/radiology') },
  { href: '/prescriptions', label: 'Upload Rx', match: (p: string) => p.startsWith('/prescriptions') },
  { href: '/health', label: 'Health Records', match: (p: string) => p.startsWith('/health') },
  { href: '/deals', label: 'Offers', match: (p: string) => p.startsWith('/deals') },
  { href: '/care-plan', label: 'Care Plan', match: (p: string) => p.startsWith('/care-plan') },
  { href: '/partners', label: 'Partners', match: (p: string) => p.startsWith('/partners') },
] as const;

/** Dev/local URLs for World-Pharma role-based portals. */
export const PLATFORM_APP_URLS = {
  customer: 'http://localhost:3000',
  admin: 'http://localhost:3001',
  doctor: 'http://localhost:3002',
  store: 'http://localhost:3003',
  vendor: 'http://localhost:3004',
  lab: 'http://localhost:3005',
  radiology: 'http://localhost:3006',
  radiologist: 'http://localhost:3007',
  join: 'http://localhost:3008',
  pathologist: 'http://localhost:3009',
  affiliate: 'http://localhost:3010',
  logistics: 'http://localhost:3011',
} as const;

export function PlatformEcosystemNav({ pathname }: { pathname: string }) {
  return (
    <nav className="wp-ecosystem-nav" aria-label="Healthcare services">
      {PLATFORM_ECOSYSTEM_LINKS.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={item.match(pathname) ? 'wp-ecosystem-link is-active' : 'wp-ecosystem-link'}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function PlatformPartnerStrip() {
  return (
    <div className="wp-partner-strip">
      <span className="wp-partner-strip-label">World Pharma platform</span>
      <a href={PLATFORM_APP_URLS.customer}>Customer store</a>
      <a href={PLATFORM_APP_URLS.join}>Partner with us</a>
      <a href={PLATFORM_APP_URLS.admin}>Admin</a>
    </div>
  );
}

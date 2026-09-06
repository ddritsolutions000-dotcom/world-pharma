import type { ReactNode } from 'react';
import type { VendorNavIcon } from './vendor-workspace-nav';

const common = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const paths: Record<VendorNavIcon, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  organization: (
    <>
      <path d="M4 21V5a1 1 0 0 1 1-1h5v17" />
      <path d="M10 21V9h10v12" />
      <path d="M7 9h.01M7 13h.01M7 17h.01M14 13h.01M14 17h.01" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21c1.5-4 12.5-4 14 0" />
    </>
  ),
  marketplace: (
    <>
      <path d="M3 9h18l-2 11H5L3 9Z" />
      <path d="M8 9V6a4 4 0 0 1 8 0v3" />
    </>
  ),
  catalog: (
    <>
      <path d="M12 3 3 7.5 12 12l9-4.5L12 3Z" />
      <path d="M3 12.5 12 17l9-4.5" />
      <path d="M3 17.5 12 22l9-4.5" />
    </>
  ),
  pricing: (
    <>
      <path d="M20.59 13.41 11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82Z" />
      <circle cx="7.5" cy="7.5" r="1.25" fill="currentColor" stroke="none" />
    </>
  ),
  inventory: (
    <>
      <path d="M21 8.5 12 4 3 8.5 12 13l9-4.5Z" />
      <path d="M3 12.5 12 17l9-4.5" />
      <path d="M3 16.5 12 21l9-4.5" />
    </>
  ),
  orders: (
    <>
      <path d="M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-4" />
      <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2Z" />
      <path d="M9 12h6M9 16h4" />
    </>
  ),
  returns: (
    <>
      <path d="M4 7h11a3 3 0 0 1 0 6H9" />
      <path d="M7 10 4 7l3-3" />
      <path d="M20 17H9a3 3 0 0 1 0-6h6" />
      <path d="M17 14l3 3-3 3" />
    </>
  ),
  shipments: (
    <>
      <path d="M3 7h11v10H3z" />
      <path d="M14 10h4l3 3v4h-7V10Z" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="17.5" cy="17.5" r="1.5" />
    </>
  ),
  settlements: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </>
  ),
  support: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 4.2 1.8c0 1.5-2.2 1.7-2.2 3.2" />
      <circle cx="12" cy="17.25" r="0.75" fill="currentColor" stroke="none" />
    </>
  ),
  notifications: (
    <>
      <path d="M15 17H9l-5 3V7a5 5 0 0 1 10 0v10Z" />
      <path d="M13.5 4.5a2.5 2.5 0 0 0-5 0" />
    </>
  ),
  security: (
    <>
      <path d="M12 3 5 6v6c0 4.4 3 8.5 7 9 4-.5 7-4.6 7-9V6l-7-3Z" />
      <path d="m9.5 12 1.8 1.8L15.5 10" />
    </>
  ),
  audit: (
    <>
      <path d="M12 8v5l3 2" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  compliance: (
    <>
      <path d="M12 3 5 6v6c0 4.4 3 8.5 7 9 4-.5 7-4.6 7-9V6l-7-3Z" />
      <path d="M12 11v2" />
      <circle cx="12" cy="8.5" r="0.75" fill="currentColor" stroke="none" />
    </>
  ),
  reports: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 17V11" />
      <path d="M12 17V7" />
      <path d="M16 17v-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M3 20c1.2-3 5-4.5 6-4.5s4.8 1.5 6 4.5" />
    </>
  ),
};

export function VendorNavIconGlyph({ icon, className }: { icon: VendorNavIcon; className?: string }) {
  return (
    <svg {...common} className={className} aria-hidden>
      {paths[icon]}
    </svg>
  );
}

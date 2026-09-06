import Link from 'next/link';
import type { SiteShortcut } from '@world-pharma/shared/site-chrome';

export function ServiceShortcuts({ shortcuts }: { shortcuts?: SiteShortcut[] }) {
  const items = shortcuts?.length ? shortcuts : [];
  if (!items.length) return null;
  return (
    <nav className="mg-services" aria-label="Services">
      <ul className="mg-services-list">
        {items.map((item) => (
          <li key={item.href + item.label}>
            <Link href={item.href} className="mg-service-item">
              <span className="mg-service-icon" style={{ background: item.bg }}>
                <span aria-hidden>{item.icon}</span>
              </span>
              <span className="mg-service-label">{item.label}</span>
              <span className="mg-service-tag">{item.sub}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

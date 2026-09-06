'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DEFAULT_CATEGORY_RAIL, type SiteShortcut } from '@world-pharma/shared/site-chrome';

export function CategoryRail({ items }: { items?: SiteShortcut[] }) {
  const pathname = usePathname() ?? '/';
  const rail = items?.length ? items : DEFAULT_CATEGORY_RAIL;
  return (
    <nav className="wp-cat-rail" aria-label="Shop by service">
      <ul className="wp-cat-rail-list">
        {rail.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href + item.label}>
              <Link href={item.href} className={active ? 'wp-cat-rail-item is-active' : 'wp-cat-rail-item'}>
                <span className="wp-cat-rail-icon" style={{ background: item.bg }} aria-hidden>
                  {item.icon}
                </span>
                <span className="wp-cat-rail-label">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

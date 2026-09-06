'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MouseEvent } from 'react';

export type VendorNavItem = {
  href: string;
  label: string;
  external?: boolean;
};

export function scrollToVendorSection(hash: string): boolean {
  const id = hash.replace(/^#/, '').trim();
  if (!id) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  }
  const el = document.getElementById(id);
  if (!el) {
    return false;
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

export function parseVendorNavHref(href: string): { path: string; hash: string } {
  const hashIndex = href.indexOf('#');
  if (hashIndex === -1) {
    return { path: href || '/', hash: '' };
  }
  return {
    path: href.slice(0, hashIndex) || '/',
    hash: href.slice(hashIndex + 1),
  };
}

export function isVendorNavActive(pathname: string, href: string): boolean {
  const { path, hash } = parseVendorNavHref(href);
  if (hash) {
    return pathname === path;
  }
  if (path === '/join' || path === '/join/apply' || path === '/join/status') {
    return pathname === path || pathname.startsWith(`${path}/`);
  }
  return pathname === path;
}

export function VendorNavLink({
  item,
  className,
  onNavigate,
}: {
  item: VendorNavItem;
  className: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? '/';

  if (item.external) {
    return (
      <a href={item.href} className={className} target="_blank" rel="noreferrer" onClick={onNavigate}>
        {item.label}
      </a>
    );
  }

  const { path, hash } = parseVendorNavHref(item.href);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onNavigate?.();

    if (!hash) {
      return;
    }

    if (pathname === path) {
      event.preventDefault();
      scrollToVendorSection(hash);
      window.history.pushState(null, '', `${path}#${hash}`);
    }
  };

  return (
    <Link href={item.href} className={className} onClick={handleClick} scroll={!hash}>
      {item.label}
    </Link>
  );
}

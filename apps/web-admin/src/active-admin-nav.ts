import type { ShellNavItem } from '@world-pharma/shell-core';

export function normalizeAdminPath(pathname: string): string {
  const path = pathname.split('?')[0]?.split('#')[0]?.replace(/\/+$/, '') || '/';
  return path === '' ? '/' : path;
}

/** Longest matching href wins. `/` is exact-only so nested routes do not highlight Home. */
export function resolveActiveNavId(pathname: string, items: ShellNavItem[]): string {
  const path = normalizeAdminPath(pathname);
  const ranked = items
    .map((item) => {
      const href = normalizeAdminPath(item.href);
      return { id: item.id, href };
    })
    .filter((row) => (row.href === '/' ? path === '/' : path === row.href || path.startsWith(`${row.href}/`)))
    .sort((a, b) => b.href.length - a.href.length);
  return ranked[0]?.id ?? 'home';
}

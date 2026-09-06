import {
  DEFAULT_SITE_NAV,
  isNavSectionActive,
  type SiteNavSection,
} from '@world-pharma/shared/site-chrome';

export type MegaMenuLink = {
  href: string;
  label: string;
  description?: string;
  icon?: string;
  match?: (pathname: string) => boolean;
};

export type MegaMenuColumn = {
  title: string;
  links: MegaMenuLink[];
};

export type MegaMenuFeatured = {
  href: string;
  label: string;
  description: string;
  icon: string;
};

export type MegaMenuSection = {
  id: string;
  label: string;
  href?: string;
  match?: (pathname: string) => boolean;
  featured?: MegaMenuFeatured[];
  columns?: MegaMenuColumn[];
};

export function siteNavToMega(section: SiteNavSection): MegaMenuSection {
  return {
    id: section.id,
    label: section.label,
    href: section.href,
    featured: section.featured?.map((row) => ({
      href: row.href,
      label: row.label,
      description: row.description ?? '',
      icon: row.icon ?? '•',
    })),
    columns: section.columns?.map((col) => ({
      title: col.title,
      links: col.links.map((link) => ({
        href: link.href,
        label: link.label,
        description: link.description,
        icon: link.icon,
        match: (pathname: string) => pathname === link.href || pathname.startsWith(`${link.href}/`),
      })),
    })),
    match: (pathname) => isNavSectionActive(section, pathname),
  };
}

export const MEGA_MENU_SECTIONS: MegaMenuSection[] = DEFAULT_SITE_NAV.sections
  .filter((row) => row.enabled)
  .map(siteNavToMega);

export function flattenMegaMenuLinks(sections: MegaMenuSection[] = MEGA_MENU_SECTIONS): MegaMenuLink[] {
  const out: MegaMenuLink[] = [];
  for (const section of sections) {
    if (section.href) {
      out.push({ href: section.href, label: section.label, match: section.match });
      continue;
    }
    for (const col of section.columns ?? []) {
      out.push(...col.links);
    }
  }
  return out;
}

export function isMegaSectionActive(section: MegaMenuSection, pathname: string): boolean {
  if (section.match?.(pathname)) return true;
  for (const col of section.columns ?? []) {
    for (const link of col.links) {
      if (link.match?.(pathname)) return true;
    }
  }
  return false;
}

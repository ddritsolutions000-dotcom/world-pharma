'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_SITE_FOOTER,
  DEFAULT_SITE_HERO,
  DEFAULT_SITE_NAV,
  parseSiteFooter,
  parseSiteHero,
  parseSiteNav,
  SITE_FOOTER_SLUG,
  SITE_HERO_SLUG,
  SITE_NAV_SLUG,
  type SiteFooterDocument,
  type SiteHeroDocument,
  type SiteNavDocument,
} from '@world-pharma/shared/site-chrome';
import { fetchHelpArticle } from './help-api';

export function useSiteChrome(country: string) {
  const [nav, setNav] = useState<SiteNavDocument>(DEFAULT_SITE_NAV);
  const [footer, setFooter] = useState<SiteFooterDocument>(DEFAULT_SITE_FOOTER);
  const [hero, setHero] = useState<SiteHeroDocument>(DEFAULT_SITE_HERO);

  useEffect(() => {
    if (!country.trim()) {
      setNav(DEFAULT_SITE_NAV);
      setFooter(DEFAULT_SITE_FOOTER);
      setHero(DEFAULT_SITE_HERO);
      return;
    }
    let cancelled = false;
    void Promise.all([
      fetchHelpArticle(country, SITE_NAV_SLUG).catch(() => null),
      fetchHelpArticle(country, SITE_FOOTER_SLUG).catch(() => null),
      fetchHelpArticle(country, SITE_HERO_SLUG).catch(() => null),
    ]).then(([navRow, footerRow, heroRow]) => {
      if (cancelled) {
        return;
      }
      setNav(parseSiteNav(navRow?.body));
      setFooter(parseSiteFooter(footerRow?.body));
      setHero(parseSiteHero(heroRow?.body));
    });
    return () => {
      cancelled = true;
    };
  }, [country]);

  return { nav, footer, hero };
}

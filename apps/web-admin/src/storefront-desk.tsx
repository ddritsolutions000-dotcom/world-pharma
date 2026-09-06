'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { Button, Card, Heading, LoadingState, Text } from '@world-pharma/ui-kit/web';
import { CmsAdminApiError, listCmsContent } from './cms-admin-api';
import { listMarketingCampaigns } from './marketing-api';
import { listPromoCampaigns } from './promo-api';
import { seoIssuesFor } from './seo-audit';
import { workingCountry } from './working-country';

type Counts = {
  banners: number;
  landings: number;
  articles: number;
  catalog: number;
  campaigns: number;
  promos: number;
  seoIssues: number;
};

function DeskTile({
  href,
  title,
  count,
  hint,
}: {
  href: string;
  title: string;
  count: number | string;
  hint: string;
}) {
  return (
    <Link href={href} className="wp-attention-tile">
      <span className="wp-attention-count">{count}</span>
      <span className="wp-attention-label">{title}</span>
      <span className="wp-text-muted">{hint}</span>
    </Link>
  );
}

export function StorefrontDesk() {
  const { getAccessToken, session } = useSession();
  const country = workingCountry(session.countryCode);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setError('');
    try {
      const [cms, catalogRes, campaigns, promos] = await Promise.all([
        listCmsContent(token, { country_code: country }).catch((err) => {
          if (err instanceof CmsAdminApiError && err.status === 403) {
            return { data: [] as Awaited<ReturnType<typeof listCmsContent>>['data'] };
          }
          throw err;
        }),
        fetch(`${adminApiRoot()}/api/v1/admin/catalog/items`, {
          headers: adminAuthHeaders(token),
        }),
        session.permissions.includes('campaign:read')
          ? listMarketingCampaigns(token, country).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
        session.permissions.includes('promo:read')
          ? listPromoCampaigns(token, country).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] }),
      ]);
      const cmsRows = cms.data ?? [];
      const catalogBody = catalogRes.ok ? await catalogRes.json() : { data: [] };
      const catalogRows = Array.isArray(catalogBody) ? catalogBody : (catalogBody.data ?? []);
      setCounts({
        banners: cmsRows.filter((row) => row.content_type === 'BANNER').length,
        landings: cmsRows.filter((row) => row.content_type === 'LANDING').length,
        articles: cmsRows.filter((row) => row.content_type === 'ARTICLE' || row.content_type === 'FAQ').length,
        catalog: catalogRows.length,
        campaigns: campaigns.data?.length ?? 0,
        promos: promos.data?.length ?? 0,
        seoIssues: cmsRows.filter((row) =>
          seoIssuesFor({
            id: row.id,
            title: row.title,
            slug: row.slug,
            summary: row.summary ?? '',
            status: row.status,
            locale: row.locale,
            content_type: row.content_type,
          }).length > 0,
        ).length,
      });
    } catch {
      setError('Storefront desk could not load. Check cms:read / catalog:admin and API 4000.');
      setCounts({
        banners: 0,
        landings: 0,
        articles: 0,
        catalog: 0,
        campaigns: 0,
        promos: 0,
        seoIssues: 0,
      });
    }
  }, [country, getAccessToken, session.permissions]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  if (!counts) {
    return <LoadingState label="Loading storefront desk" />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Storefront desk</Heading>
        <p className="wp-page-intro">
          Merchandising for {country}: banners, landing/help pages, product catalog, on-page SEO, campaigns, and
          promos. Create and publish here — this is not Google Ads, Search Console, or 1mg retail-media (OnlineSales).
          Customer 3000 reads published CMS banners, articles, catalog, plus header/footer/homepage copy from Storefront → Header / footer.
        </p>
      </header>
      {error ? <Text tone="secondary">{error}</Text> : null}

      <div className="wp-attention-grid">
        <DeskTile href={`/storefront/chrome`} title="Header / footer" count="CMS" hint="Menu, footer, home rails" />
        <DeskTile href="/cms/media" title="Media" count="CMS" hint="Merchandising images" />
        <DeskTile href={`/cms?country=${country}&type=BANNER`} title="Banners" count={counts.banners} hint="CMS type BANNER" />
        <DeskTile href={`/cms?country=${country}&type=LANDING`} title="Landing pages" count={counts.landings} hint="Live at /l/{slug}" />
        <DeskTile href={`/cms/blog?country=${country}`} title="Blog" count={counts.articles} hint="Add posts for /blog" />
        <DeskTile href={`/cms/legal?country=${country}`} title="Legal pages" count="CMS" hint="Privacy, terms, returns" />
        <DeskTile href={`/cms/faq?country=${country}`} title="FAQ" count="CMS" hint="Questions on /faq" />
        <DeskTile href="/catalog" title="Products" count={counts.catalog} hint="Catalog publish / archive" />
        <DeskTile href="/seo" title="SEO issues" count={counts.seoIssues} hint="Title/meta length, not GSC" />
        <DeskTile href="/marketing" title="Campaigns" count={counts.campaigns} hint="Segments + send" />
        <DeskTile href="/promo" title="Promos" count={counts.promos} hint="Coupons / campaigns" />
      </div>

      <Card>
        <Heading level={2}>Create now</Heading>
        <div className="wp-toolbar">
          <Link href="/storefront/chrome">
            <Button>Edit header, footer &amp; homepage</Button>
          </Link>
          <Link href={`/cms/new?country=${country}&type=BANNER`}>
            <Button>New banner</Button>
          </Link>
          <Link href={`/cms/new?country=${country}&type=LANDING`}>
            <Button variant="secondary">New landing page</Button>
          </Link>
          <Link href={`/cms/new?country=${country}&type=ARTICLE&category=blog&intent=blog`}>
            <Button variant="secondary">Add blog post</Button>
          </Link>
          <Link href={`/cms/legal?country=${country}`}>
            <Button variant="secondary">Edit legal pages</Button>
          </Link>
          <Link href={`/cms/faq?country=${country}`}>
            <Button variant="secondary">Add FAQ</Button>
          </Link>
          <Link href={`/cms/pages?country=${country}`}>
            <Button variant="secondary">Company pages</Button>
          </Link>
          <Link href="/catalog">
            <Button variant="secondary">New product</Button>
          </Link>
          <Link href="/marketing">
            <Button variant="secondary">New campaign</Button>
          </Link>
          <Link href="/promo">
            <Button variant="secondary">New promo</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

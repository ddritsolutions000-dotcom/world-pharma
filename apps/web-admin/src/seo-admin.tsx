'use client';

import Link from 'next/link';
import { AdminRequestError } from './admin-request-error';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  PermissionDeniedState,
} from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';
import { CmsAdminApiError, listCmsContent, type CmsContentItem } from './cms-admin-api';
import { seoIssuesFor, type SeoContentRow } from './seo-audit';
import { workingCountry } from './working-country';
import { customerSiteUrl } from './site-url';

function toRow(item: CmsContentItem): SeoContentRow {
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    summary: item.summary ?? '',
    status: item.status,
    locale: item.locale,
    content_type: item.content_type,
  };
}

export function SeoAdminPanel() {
  const { getAccessToken, session } = useSession();
  const countryCode = workingCountry(session.countryCode);
  const [rows, setRows] = useState<SeoContentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setDenied(false);
    setError(false);
    try {
      const body = await listCmsContent(token, { country_code: countryCode });
      setRows((body.data ?? []).map(toRow));
    } catch (err) {
      if (err instanceof CmsAdminApiError && err.status === 403) {
        setDenied(true);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [countryCode, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const scored = useMemo(
    () =>
      rows.map((row) => ({
        row,
        issues: seoIssuesFor(row),
      })),
    [rows],
  );
  const openIssues = scored.filter((item) => item.issues.length > 0).length;

  if (denied) {
    return <PermissionDeniedState />;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>SEO workspace</Heading>
        <p className="wp-page-intro">
          On-page checks from CMS titles, slugs, and summaries. Global title, robots.txt, and redirects are edited at{' '}
          <Link href="/storefront/chrome">Header / footer / SEO</Link> and published as the <code>site-seo</code> pack.
          This is not Google Search Console.
        </p>
      </header>
      <div className="wp-toolbar">
        <a href={`${customerSiteUrl()}/sitemap.xml`} target="_blank" rel="noreferrer">
          <Button variant="secondary">Open sitemap.xml</Button>
        </a>
        <a href={`${customerSiteUrl()}/robots.txt`} target="_blank" rel="noreferrer">
          <Button variant="secondary">Open robots.txt</Button>
        </a>
        <Link href="/storefront/chrome">
          <Button>Edit global SEO</Button>
        </Link>
      </div>
      {loading && rows.length === 0 ? <LoadingState label="Loading CMS for SEO" /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      <p className="wp-text-muted">
        {rows.length} page(s) · {openIssues} with issues · storefront URLs follow CMS slugs on customer web.
      </p>
      {!loading && rows.length === 0 && !error ? (
        <EmptyState
          title="No CMS pages"
          description="Create articles or landing pages in CMS, then return here to score title and meta length."
        />
      ) : null}
      {scored.length ? (
        <Card>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Slug</th>
                  <th>Status</th>
                  <th>Issues</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {scored.map(({ row, issues }) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>/{row.slug}</td>
                    <td>
                      <span className="wp-status">{row.status}</span>
                    </td>
                    <td>{issues.length ? issues.map((issue) => issue.label).join('; ') : 'Ready'}</td>
                    <td>
                      <Link href={`/cms/${row.id}?country=${countryCode}`}>Edit CMS</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </section>
  );
}

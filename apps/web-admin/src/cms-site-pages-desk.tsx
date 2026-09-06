'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { Button, Card, Heading, LoadingState, PermissionDeniedState, Text } from '@world-pharma/ui-kit/web';
import { AdminRequestError } from './admin-request-error';
import { CmsAdminApiError, createCmsContent, listCmsContent, publishCmsContent, reviseCmsContent, submitCmsReview, type CmsContentItem } from './cms-admin-api';
import { OPERATOR_SITE_PAGES } from './operator-site-pages';
import { workingCountry } from './working-country';
import { resolveCompanyPageUrl } from './site-url';

export function CmsSitePagesDesk() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getAccessToken, session } = useSession();
  const countryCode = workingCountry(searchParams.get('country') ?? session.countryCode);
  const [rows, setRows] = useState<CmsContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busySlug, setBusySlug] = useState('');
  const [error, setError] = useState('');

  const canWrite = session.permissions.includes('cms:write');
  const canPublish = session.permissions.includes('cms:publish');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const pages = await Promise.all(
        OPERATOR_SITE_PAGES.map((page) =>
          listCmsContent(token, { country_code: countryCode, slug: page.slug }).then((body) => body.data ?? []),
        ),
      );
      setRows(pages.flat());
    } catch (err) {
      if (err instanceof CmsAdminApiError && err.status === 403) {
        setRows([]);
      } else {
        setLoadError(err);
      }
    } finally {
      setLoading(false);
    }
  }, [countryCode, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const publishPage = async (slug: string) => {
    const token = getAccessToken();
    const match = rows.find((row) => row.slug === slug);
    if (!token || !match || !canPublish) {
      return;
    }
    setBusySlug(slug);
    setError('');
    try {
      let item = match;
      if (item.status === 'DRAFT') {
        item = await submitCmsReview(token, item.id, countryCode);
      }
      await publishCmsContent(token, item.id, countryCode, `site-${item.id}-${Date.now()}`);
      await load();
    } catch (err) {
      if (err instanceof CmsAdminApiError) {
        setError(err.message);
      } else {
        setError('Publish failed.');
      }
    } finally {
      setBusySlug('');
    }
  };

  const openPage = async (slug: string) => {
    const token = getAccessToken();
    if (!token || !canWrite) {
      return;
    }
    const spec = OPERATOR_SITE_PAGES.find((page) => page.slug === slug);
    if (!spec) {
      return;
    }
    setBusySlug(slug);
    setError('');
    try {
      let match = rows.find((row) => row.slug === slug);
      if (!match) {
        match = await createCmsContent(token, {
          country_code: countryCode,
          content_type: 'ARTICLE',
          slug: spec.slug,
          title: spec.title,
          summary: spec.summary,
          body: spec.starterBody,
          category_slug: 'company',
          locale: 'en',
        });
      } else if (match.status === 'PUBLISHED') {
        match = await reviseCmsContent(token, match.id, countryCode);
      }
      router.push(`/cms/${match.id}?country=${countryCode}`);
    } catch (err) {
      if (err instanceof CmsAdminApiError) {
        setError(err.message);
      } else {
        setError('Could not open this page.');
      }
    } finally {
      setBusySlug('');
    }
  };

  if (!session.permissions.includes('cms:read')) {
    return <PermissionDeniedState />;
  }
  if (loading && rows.length === 0 && !loadError) {
    return <LoadingState label="Loading company pages" />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Company pages</Heading>
        <p className="wp-page-intro">
          Contact, partners, and join-portal copy. Join pages use the visual block editor in CMS. Publish requires
          IN_REVIEW — quick publish here auto-submits drafts first; dual-control still applies if you edited the page.
        </p>
      </header>
      {loadError ? <AdminRequestError error={loadError} onRetry={() => void load()} /> : null}
      {error ? <Text tone="secondary">{error}</Text> : null}
      <div className="wp-legal-page-grid">
        {OPERATOR_SITE_PAGES.map((page) => {
          const match = rows.find((row) => row.slug === page.slug);
          return (
            <Card key={page.slug}>
              <div className="wp-stack">
                <Heading level={3}>{page.title}</Heading>
                <Text tone="secondary">{page.summary}</Text>
                <Text tone="secondary">
                  Slug <code>{page.slug}</code> · {page.customerPath}
                </Text>
                <Text tone="secondary">CMS: {match ? match.status : 'not created yet'}</Text>
                <div className="wp-row-actions" style={{ justifyContent: 'flex-start' }}>
                  {canWrite ? (
                    <Button disabled={busySlug === page.slug} onClick={() => void openPage(page.slug)}>
                      {busySlug === page.slug ? 'Opening…' : match ? 'Edit content' : 'Create and edit'}
                    </Button>
                  ) : null}
                  {canPublish && match && match.status !== 'PUBLISHED' && match.status !== 'ARCHIVED' ? (
                    <Button variant="secondary" disabled={busySlug === page.slug} onClick={() => void publishPage(page.slug)}>
                      Publish to 3000
                    </Button>
                  ) : null}
                  {match?.status === 'PUBLISHED' ? (
                    <a
                      href={resolveCompanyPageUrl(page.customerPath)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Button variant="tertiary">Open live</Button>
                    </a>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

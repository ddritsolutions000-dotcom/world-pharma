'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { Button, Card, Heading, LoadingState, PermissionDeniedState, Text } from '@world-pharma/ui-kit/web';
import { AdminRequestError } from './admin-request-error';
import { CmsAdminApiError, createCmsContent, listCmsContent, publishCmsContent, reviseCmsContent, type CmsContentItem } from './cms-admin-api';
import { LEGAL_SITE_PAGES } from './legal-page-catalog';
import { workingCountry } from './working-country';
import { customerPageUrl } from './site-url';

export function CmsLegalDesk() {
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

  const publishPage = async (slug: string) => {
    const token = getAccessToken();
    const match = rows.find((row) => row.slug === slug);
    if (!token || !match || !canPublish) {
      return;
    }
    setBusySlug(slug);
    setError('');
    try {
      await publishCmsContent(token, match.id, countryCode, `legal-${match.id}-${Date.now()}`);
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

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const pages = await Promise.all(
        LEGAL_SITE_PAGES.map((page) =>
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

  const openPage = async (slug: string) => {
    const token = getAccessToken();
    if (!token || !canWrite) {
      return;
    }
    const spec = LEGAL_SITE_PAGES.find((page) => page.slug === slug);
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
          content_type: 'LEGAL_NOTICE',
          slug: spec.slug,
          title: spec.title,
          summary: spec.summary,
          body: spec.starterBody,
          category_slug: 'legal',
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
        setError('Could not open this legal page.');
      }
    } finally {
      setBusySlug('');
    }
  };

  if (!session.permissions.includes('cms:read')) {
    return <PermissionDeniedState />;
  }
  if (loading && rows.length === 0 && !loadError) {
    return <LoadingState label="Loading legal pages" />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Legal pages</Heading>
        <p className="wp-page-intro">
          These slugs are what customer 3000 already loads. Edit the draft, then Publish. Until published, the site keeps
          the built-in fallback copy.
        </p>
      </header>

      {loadError ? <AdminRequestError error={loadError} onRetry={() => void load()} /> : null}
      {error ? <Text tone="secondary">{error}</Text> : null}

      <div className="wp-legal-page-grid">
        {LEGAL_SITE_PAGES.map((page) => {
          const match = rows.find((row) => row.slug === page.slug);
          return (
            <Card key={page.slug}>
              <div className="wp-stack">
                <Heading level={3}>{page.title}</Heading>
                <Text tone="secondary">{page.summary}</Text>
                <Text tone="secondary">
                  Slug <code>{page.slug}</code> · live path {page.customerPath}
                </Text>
                <Text tone="secondary">CMS: {match ? `${match.status} (${match.content_type})` : 'not created yet'}</Text>
                <div className="wp-row-actions" style={{ justifyContent: 'flex-start' }}>
                  {canWrite ? (
                    <Button disabled={busySlug === page.slug} onClick={() => void openPage(page.slug)}>
                      {busySlug === page.slug ? 'Opening…' : match ? 'Edit content' : 'Create and edit'}
                    </Button>
                  ) : match ? (
                    <Link href={`/cms/${match.id}?country=${countryCode}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                  ) : null}
                  {canPublish && match && match.status !== 'PUBLISHED' && match.status !== 'ARCHIVED' ? (
                    <Button
                      variant="secondary"
                      disabled={busySlug === page.slug}
                      onClick={() => void publishPage(page.slug)}
                    >
                      Publish to 3000
                    </Button>
                  ) : null}
                  {match?.status === 'PUBLISHED' ? (
                    <a href={customerPageUrl(page.customerPath)} target="_blank" rel="noreferrer">
                      <Button variant="tertiary">Open on 3000</Button>
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

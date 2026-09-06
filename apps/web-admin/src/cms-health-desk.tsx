'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { Button, Card, EmptyState, Heading, LoadingState, PermissionDeniedState, Text } from '@world-pharma/ui-kit/web';
import { AdminRequestError } from './admin-request-error';
import {
  CmsAdminApiError,
  archiveCmsContent,
  listCmsContent,
  publishCmsContent,
  submitCmsReview,
  type CmsContentItem,
} from './cms-admin-api';
import { workingCountry } from './working-country';
import { customerPageUrl } from './site-url';

/** Matches `HEALTH_CATEGORY_SLUGS` in apps/api health-content.service.ts */
export const HEALTH_EDUCATION_CATEGORIES = [
  'medicines',
  'diseases',
  'lab-tests',
  'wellness',
  'nutrition',
  'first-aid',
  'parenting',
  'mental-health',
  'ayurveda',
  'homeopathy',
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  medicines: 'Medicines',
  diseases: 'Diseases',
  'lab-tests': 'Lab tests',
  wellness: 'Wellness',
  nutrition: 'Nutrition',
  'first-aid': 'First aid',
  parenting: 'Parenting',
  'mental-health': 'Mental health',
  ayurveda: 'Ayurveda',
  homeopathy: 'Homeopathy',
};

export function CmsHealthDesk() {
  const searchParams = useSearchParams();
  const { getAccessToken, session } = useSession();
  const countryCode = workingCountry(searchParams.get('country') ?? session.countryCode);
  const [rows, setRows] = useState<CmsContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState('');

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
      const body = await listCmsContent(token, { country_code: countryCode, content_type: 'ARTICLE' });
      setRows(body.data ?? []);
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

  const articles = useMemo(() => {
    const allowed = new Set<string>(HEALTH_EDUCATION_CATEGORIES);
    return rows.filter((row) => {
      const cat = (row.category_slug ?? '').toLowerCase();
      return allowed.has(cat);
    });
  }, [rows]);

  const publishArticle = async (row: CmsContentItem) => {
    const token = getAccessToken();
    if (!token || !canPublish) {
      return;
    }
    setBusyId(row.id);
    try {
      let item = row;
      if (item.status === 'DRAFT') {
        item = await submitCmsReview(token, item.id, countryCode);
      }
      await publishCmsContent(token, item.id, countryCode, `health-${item.id}-${Date.now()}`);
      await load();
    } finally {
      setBusyId('');
    }
  };

  if (!session.permissions.includes('cms:read')) {
    return <PermissionDeniedState />;
  }
  if (loading && rows.length === 0 && !loadError) {
    return <LoadingState label="Loading health education" />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Health education</Heading>
        <p className="wp-page-intro">
          Curated patient education for customer 3000 health hub and home featured articles. Use category slugs such as{' '}
          <code>diseases</code>, <code>wellness</code>, or <code>ayurveda</code>. Educational only — not clinical advice.
        </p>
      </header>

      <div className="wp-toolbar">
        {canWrite ? (
          <Link href={`/cms/new?country=${countryCode}&type=ARTICLE&category=wellness&intent=health`}>
            <Button>Add article</Button>
          </Link>
        ) : null}
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {loadError ? <AdminRequestError error={loadError} onRetry={() => void load()} /> : null}

      {articles.length === 0 ? (
        <EmptyState
          title="No health articles yet"
          description="Create an ARTICLE with a health category slug, submit for review, then publish."
        />
      ) : (
        <Card>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Slug</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {articles.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>{CATEGORY_LABELS[row.category_slug ?? ''] ?? row.category_slug ?? '—'}</td>
                    <td>
                      <Text tone="secondary">{row.status}</Text>
                    </td>
                    <td>
                      <code>{row.slug}</code>
                    </td>
                    <td>
                      <div className="wp-row-actions">
                        <Link href={`/cms/${row.id}?country=${countryCode}`}>
                          <Button size="sm" variant="secondary">
                            Edit
                          </Button>
                        </Link>
                        {canPublish && row.status !== 'PUBLISHED' && row.status !== 'ARCHIVED' ? (
                          <Button
                            size="sm"
                            disabled={busyId === row.id}
                            onClick={() => void publishArticle(row)}
                          >
                            Publish
                          </Button>
                        ) : null}
                        {row.status === 'PUBLISHED' ? (
                          <a href={customerPageUrl(`/health/${row.slug}`)} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="tertiary">
                              Open live
                            </Button>
                          </a>
                        ) : null}
                        {canPublish && row.status === 'PUBLISHED' ? (
                          <Button
                            size="sm"
                            variant="tertiary"
                            disabled={busyId === row.id}
                            onClick={() => {
                              const token = getAccessToken();
                              if (!token) {
                                return;
                              }
                              setBusyId(row.id);
                              void archiveCmsContent(token, row.id, countryCode)
                                .then(() => load())
                                .finally(() => setBusyId(''));
                            }}
                          >
                            Archive
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

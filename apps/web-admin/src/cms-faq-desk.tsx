'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { Button, Card, EmptyState, Heading, LoadingState, PermissionDeniedState, Text } from '@world-pharma/ui-kit/web';
import { AdminRequestError } from './admin-request-error';
import {
  CmsAdminApiError,
  archiveCmsContent,
  listCmsContent,
  publishCmsContent,
  type CmsContentItem,
} from './cms-admin-api';
import { workingCountry } from './working-country';
import { customerPageUrl } from './site-url';

export function CmsFaqDesk() {
  const searchParams = useSearchParams();
  const { getAccessToken, session } = useSession();
  const countryCode = workingCountry(searchParams.get('country') ?? session.countryCode);
  const [rows, setRows] = useState<CmsContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const canWrite = session.permissions.includes('cms:write');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const body = await listCmsContent(token, { country_code: countryCode, content_type: 'FAQ' });
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

  if (!session.permissions.includes('cms:read')) {
    return <PermissionDeniedState />;
  }
  if (loading && rows.length === 0 && !loadError) {
    return <LoadingState label="Loading FAQs" />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>FAQ</Heading>
        <p className="wp-page-intro">
          Add a question, then Publish. Customer 3000 lists published FAQ rows on /faq.
        </p>
      </header>

      <div className="wp-toolbar">
        {canWrite ? (
          <Link href={`/cms/new?country=${countryCode}&type=FAQ&category=faq&intent=faq`}>
            <Button>Add FAQ</Button>
          </Link>
        ) : null}
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {loadError ? <AdminRequestError error={loadError} onRetry={() => void load()} /> : null}

      {rows.length === 0 ? (
        <EmptyState title="No FAQs yet" description="Use Add FAQ, then Publish so /faq on 3000 updates." />
      ) : (
        <Card>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Status</th>
                  <th>Slug</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>
                      <span className="wp-status">{row.status}</span>
                    </td>
                    <td>
                      <code>{row.slug}</code>
                    </td>
                    <td>
                      <div className="wp-row-actions">
                        <Link href={`/cms/${row.id}?country=${countryCode}`}>Edit</Link>
                        {row.status === 'PUBLISHED' ? (
                          <a href={customerPageUrl('/faq')} target="_blank" rel="noreferrer">
                            View
                          </a>
                        ) : null}
                        {session.permissions.includes('cms:publish') &&
                        (row.status === 'DRAFT' || row.status === 'IN_REVIEW') ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const token = getAccessToken();
                              if (!token) {
                                return;
                              }
                              void publishCmsContent(token, row.id, countryCode, `faq-${row.id}-${Date.now()}`).then(
                                () => void load(),
                              );
                            }}
                          >
                            Publish
                          </Button>
                        ) : null}
                        {session.permissions.includes('cms:publish') && row.status !== 'ARCHIVED' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const token = getAccessToken();
                              if (!token) {
                                return;
                              }
                              void archiveCmsContent(token, row.id, countryCode).then(() => void load());
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
      <Text tone="secondary">Title is the question. Body is the answer.</Text>
    </div>
  );
}

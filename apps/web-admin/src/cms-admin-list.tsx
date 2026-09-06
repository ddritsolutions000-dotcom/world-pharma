'use client';

import Link from 'next/link';
import { classifyAdminViewState } from './admin-http';
import { AdminViewLoadError } from './admin-request-error';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  LoadingState,
  PermissionDeniedState,
  Select,
} from '@world-pharma/ui-kit/web';
import {
  CmsAdminApiError,
  archiveCmsContent,
  type CmsContentItem,
  listCmsContent,
} from './cms-admin-api';
import { MARKET_COUNTRY_CODES, persistAdminCountry, resolveAdminWorkingCountry, workingCountry } from './working-country';
import { customerPageUrl } from './site-url';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

const TYPE_CHIPS = ['', 'BANNER', 'LANDING', 'ARTICLE', 'FAQ', 'LEGAL_NOTICE', 'PACK_STRING'] as const;

export function CmsAdminList() {
  const searchParams = useSearchParams();
  const { getAccessToken, session } = useSession();
  const [rows, setRows] = useState<CmsContentItem[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [countryCode, setCountryCode] = useState(() =>
    resolveAdminWorkingCountry({
      urlCountry: searchParams.get('country'),
      sessionCountry: session.countryCode,
    }),
  );
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState(() => searchParams.get('type')?.toUpperCase() ?? '');

  const canWrite = session.permissions.includes('cms:write');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    if (!countryCode) {
      setRows([]);
      setViewState('idle');
      return;
    }
    setViewState('loading');
    try {
      const body = await listCmsContent(token, {
        country_code: countryCode,
        status: statusFilter || undefined,
        content_type: typeFilter || undefined,
      });
      setRows(body.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof CmsAdminApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState(classifyAdminViewState(err));
    }
  }, [countryCode, getAccessToken, statusFilter, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  if (viewState === 'loading' && rows.length === 0) {
    return <LoadingState label="Loading CMS content" />;
  }
  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Storefront CMS</Heading>
        <p className="wp-page-intro">
          Edit banners, landing pages, blog posts, FAQ, and legal copy for {countryCode}. Use Blog and Legal pages in
          the sidebar if you only need those. Publish needs cms:publish.
        </p>
      </header>

      <div className="wp-toolbar">
        <div className="wp-toolbar-chips">
          {TYPE_CHIPS.map((type) => (
            <Button
              key={type || 'all'}
              size="sm"
              variant={typeFilter === type ? 'primary' : 'secondary'}
              onClick={() => setTypeFilter(type)}
            >
              {type || 'All types'}
            </Button>
          ))}
        </div>
        <FormField label="Country">
          {({ id }) => (
            <Select
              id={id}
              value={countryCode}
              onChange={(e) => setCountryCode(persistAdminCountry(workingCountry(e.target.value)))}
            >
              <option value="">Select country</option>
              {MARKET_COUNTRY_CODES.map((iso) => (
                <option key={iso} value={iso}>
                  {iso}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Status filter">
          {({ id }) => (
            <Select id={id} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="DRAFT">DRAFT</option>
              <option value="IN_REVIEW">IN_REVIEW</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </Select>
          )}
        </FormField>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
        {canWrite ? (
          <>
            <Link href={`/cms/new?country=${countryCode}&type=ARTICLE&category=blog&intent=blog`}>
              <Button>Add blog post</Button>
            </Link>
            <Link href={`/cms/legal?country=${countryCode}`}>
              <Button variant="secondary">Legal pages</Button>
            </Link>
            <Link href={`/cms/new?country=${countryCode}&type=${typeFilter || 'BANNER'}`}>
              <Button variant="secondary">Create {typeFilter || 'BANNER'}</Button>
            </Link>
            <Link href="/storefront">
              <Button variant="tertiary">Storefront desk</Button>
            </Link>
          </>
        ) : null}
      </div>

      <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />

      {rows.length === 0 ? (
        <EmptyState
          title="No content in this country"
          description="Switch country to IN for sandbox, or create a BANNER / LANDING / ARTICLE draft."
        />
      ) : (
        <Card>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Slug</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>{row.content_type}</td>
                    <td>
                      <span className="wp-status">{row.status}</span>
                    </td>
                    <td>
                      <code>{row.slug}</code>
                    </td>
                    <td>{new Date(row.updated_at).toLocaleString()}</td>
                    <td>
                      <div className="wp-row-actions">
                        <Link href={`/cms/${row.id}?country=${countryCode}`}>Edit</Link>
                        {row.content_type === 'LANDING' && row.status === 'PUBLISHED' ? (
                          <a href={customerPageUrl(`/l/${encodeURIComponent(row.slug)}`)} target="_blank" rel="noreferrer">
                            View
                          </a>
                        ) : null}
                        {row.content_type === 'ARTICLE' && row.status === 'PUBLISHED' ? (
                          <a href={customerPageUrl(`/blog/${encodeURIComponent(row.slug)}`)} target="_blank" rel="noreferrer">
                            Blog
                          </a>
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
    </div>
  );
}

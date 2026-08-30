'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Select,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  CMS_CONTENT_TYPES,
  CmsAdminApiError,
  type CmsContentItem,
  listCmsContent,
} from './cms-admin-api';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network';

export function CmsAdminList() {
  const { getAccessToken, session } = useSession();
  const [rows, setRows] = useState<CmsContentItem[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [countryCode, setCountryCode] = useState('XX');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const canWrite = session.permissions.includes('cms:write');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
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
      setViewState('network');
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
  if (viewState === 'network' && rows.length === 0) {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  return (
    <div className="wp-stack">
      <Heading level={1}>CMS content</Heading>
      <Text tone="secondary">
        Author operational help content. The server enforces DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED. OD-CMS-01
        dual-control is not implemented — publish requires <code>cms:publish</code> only (not a separate reviewer
        gate).
      </Text>

      <Card>
        <div className="wp-stack">
          <FormField label="Country code">
            {({ id }) => (
              <Input
                id={id}
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                placeholder="XX"
              />
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
          <FormField label="Content type filter">
            {({ id }) => (
              <Select id={id} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">All types</option>
                {CMS_CONTENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
            {canWrite ? (
              <Link href={`/cms/new?country=${countryCode}`}>
                <Button>Create content</Button>
              </Link>
            ) : null}
          </div>
        </div>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No content" description="Create a draft or adjust filters." />
      ) : (
        <div className="wp-stack">
          {rows.map((row) => (
            <Card key={row.id}>
              <Heading level={3}>{row.title}</Heading>
              <Text tone="secondary">
                {row.content_type} · {row.status} · {row.slug} · v{row.version}
              </Text>
              <Text tone="secondary">Updated {new Date(row.updated_at).toLocaleString()}</Text>
              <Link href={`/cms/${row.id}?country=${countryCode}`}>
                <Button variant="secondary">Open editor</Button>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

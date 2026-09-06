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
  Heading,
  LoadingState,
  PermissionDeniedState,
  Table,
  Text,
} from '@world-pharma/ui-kit/web';
import { CmsAdminApiError, getCmsVersions, type CmsVersionsResponse } from './cms-admin-api';
import { workingCountry } from './working-country';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

export function CmsAdminVersions({ contentId }: { contentId: string }) {
  const searchParams = useSearchParams();
  const { getAccessToken } = useSession();
  const countryCode = workingCountry(searchParams.get('country'));
  const [data, setData] = useState<CmsVersionsResponse | null>(null);
  const [viewState, setViewState] = useState<ViewState>('loading');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await getCmsVersions(token, contentId, countryCode);
      setData(body);
      setViewState('idle');
    } catch (err) {
      if (err instanceof CmsAdminApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState(classifyAdminViewState(err));
    }
  }, [contentId, countryCode, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (viewState === 'loading') {
    return <LoadingState label="Loading version history" />;
  }
  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (viewState === 'network' || viewState === 'error') {
    return (
      <div className="wp-stack">
        <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />
      </div>
    );
  }

  return (
    <div className="wp-stack">
      <Heading level={1}>Version history</Heading>
      <Link href={`/cms/${contentId}?country=${countryCode}`}>
        <Button variant="secondary">Back to editor</Button>
      </Link>

      <Card>
        <Heading level={3}>Working revisions</Heading>
        {data?.revisions.length ? (
          <Table
            caption="CMS revisions"
            columns={['Revision', 'Title', 'Created']}
            rows={data.revisions.map((row) => [
              String(row.revision_number),
              row.title,
              new Date(row.created_at).toLocaleString(),
            ])}
          />
        ) : (
          <Text tone="secondary">No revisions recorded.</Text>
        )}
      </Card>

      <Card>
        <Heading level={3}>Published snapshots (immutable)</Heading>
        {data?.publications.length ? (
          <Table
            caption="CMS publications"
            columns={['Publication', 'Revision', 'Title', 'Published']}
            rows={data.publications.map((row) => [
              String(row.publication_version),
              String(row.revision_number),
              row.title,
              new Date(row.published_at).toLocaleString(),
            ])}
          />
        ) : (
          <Text tone="secondary">No publications yet.</Text>
        )}
      </Card>
    </div>
  );
}

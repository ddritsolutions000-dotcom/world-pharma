'use client';

import Link from 'next/link';
import { AdminViewLoadError } from './admin-request-error';
import { classifyAdminViewState } from './admin-http';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,

  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import { getMarketingSegment, MarketingApiError, type MarketingSegment } from './marketing-api';
import { workingCountry } from './working-country';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error' | 'not_found';

export function MarketingSegmentDetail({ segmentId }: { segmentId: string }) {
  const searchParams = useSearchParams();
  const countryCode = workingCountry(searchParams.get('country'));
  const { getAccessToken } = useSession();
  const [data, setData] = useState<MarketingSegment | null>(null);
  const [viewState, setViewState] = useState<ViewState>('loading');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await getMarketingSegment(token, segmentId, countryCode);
      setData(body);
      setViewState('idle');
    } catch (err) {
      if (err instanceof MarketingApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      if (err instanceof MarketingApiError && err.status === 404) {
        setViewState('not_found');
        return;
      }
      setViewState(classifyAdminViewState(err));
    }
  }, [countryCode, getAccessToken, segmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (viewState === 'loading') {
    return <LoadingState label="Loading segment" />;
  }
  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (viewState === 'not_found') {
    return <EmptyState title="Segment not found" description="Check country code and segment id." />;
  }
  if (viewState === 'network' || viewState === 'error') {
    return <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />;
  }
  if (!data) {
    return null;
  }

  return (
    <div className="wp-stack">
      <Heading level={1}>{data.name}</Heading>
      <Text tone="secondary">
        {data.code} · {data.status} · preview audience {data.preview_count ?? 0}
      </Text>
      <Link href="/marketing">
        <Button variant="secondary">Back to marketing</Button>
      </Link>
      <Card>
        <Heading level={2}>Rules (non-clinical v1)</Heading>
        {data.rules && typeof data.rules === 'object' && !Array.isArray(data.rules) ? (
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.rules as Record<string, unknown>).map(([key, value]) => (
                  <tr key={key}>
                    <td>{key.replaceAll('_', ' ')}</td>
                    <td>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Text tone="secondary">No rule rows on this segment.</Text>
        )}
      </Card>
    </div>
  );
}

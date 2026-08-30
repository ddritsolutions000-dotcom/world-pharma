'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import { getMarketingSegment, MarketingApiError, type MarketingSegment } from './marketing-api';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'not_found';

export function MarketingSegmentDetail({ segmentId }: { segmentId: string }) {
  const searchParams = useSearchParams();
  const countryCode = searchParams.get('country') ?? 'XX';
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
      setViewState('network');
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
  if (viewState === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
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
        <pre>{JSON.stringify(data.rules, null, 2)}</pre>
      </Card>
    </div>
  );
}

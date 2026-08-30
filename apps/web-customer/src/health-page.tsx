'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { CustomerShell } from './customer-shell';
import { fetchHealthTimeline, uploadHealthDocument, type HealthTimelineItem } from './health-api';
import {
  classifyHealthApiFailure,
  formatArtifactType,
  formatSourceModule,
  formatWhen,
  groupTimelineByDate,
  type HealthViewError,
} from './health-utils';

const DEFAULT_COUNTRY = 'XX';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function TimelineEventCard({ item }: { item: HealthTimelineItem }) {
  const source = formatSourceModule(item.source_module);
  const typeLabel = formatArtifactType(item.artifact_type);
  const body = (
    <Card>
      <Text>{item.title}</Text>
      <Text size="caption" tone="secondary">
        {formatWhen(item.occurred_at)} · {typeLabel}
        {source ? ` · ${source}` : ''} · {item.status}
      </Text>
      {!item.artifact_id ? (
        <Text size="caption" tone="secondary">
          Record details are not available for this event.
        </Text>
      ) : null}
    </Card>
  );

  if (!item.artifact_id) {
    return body;
  }

  return (
    <Link href={`/health/artifacts/${item.artifact_id}`} aria-label={`View ${item.title}`}>
      {body}
    </Link>
  );
}

export function HealthScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [items, setItems] = useState<HealthTimelineItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<HealthViewError | null>(null);
  const [moreError, setMoreError] = useState<HealthViewError | null>(null);
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const applyTimelinePage = useCallback((pageItems: HealthTimelineItem[], cursor: string | null, append: boolean) => {
    setItems((current) => (append ? [...current, ...pageItems] : pageItems));
    setNextCursor(cursor);
  }, []);

  const loadInitial = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      const token = getAccessToken();
      if (!token || session.status !== 'authenticated') {
        return;
      }
      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      setMoreError(null);

      const result = await fetchHealthTimeline({
        token,
        onUnauthorized,
        countryCode,
      });

      if (result.ok) {
        applyTimelinePage(result.data.items ?? [], result.data.next_cursor, false);
        setError(null);
      } else {
        applyTimelinePage([], null, false);
        setError(classifyHealthApiFailure(result));
      }

      setLoading(false);
      setRefreshing(false);
    },
    [applyTimelinePage, countryCode, getAccessToken, onUnauthorized, session.status],
  );

  const loadMore = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !nextCursor) {
      return;
    }
    setLoadingMore(true);
    setMoreError(null);

    const result = await fetchHealthTimeline({
      token,
      onUnauthorized,
      countryCode,
      cursor: nextCursor,
    });

    if (result.ok) {
      applyTimelinePage(result.data.items ?? [], result.data.next_cursor, true);
    } else {
      setMoreError(classifyHealthApiFailure(result));
    }
    setLoadingMore(false);
  }, [applyTimelinePage, countryCode, getAccessToken, nextCursor, onUnauthorized]);

  const onUploadFile = useCallback(
    async (file: File) => {
      const token = getAccessToken();
      if (!token || session.status !== 'authenticated') {
        return;
      }
      const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png']);
      if (!allowed.has(file.type)) {
        setUploadError('Only PDF, JPEG, and PNG files are supported.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setUploadError('File exceeds the 10 MB upload limit.');
        return;
      }
      setUploading(true);
      setUploadError(null);
      const bytes = await file.arrayBuffer();
      const contentBase64 = arrayBufferToBase64(bytes);
      const artifactType = file.name.toLowerCase().includes('rx') ? 'PRESCRIPTION_UPLOAD' : 'DOCUMENT';
      const result = await uploadHealthDocument({
        token,
        onUnauthorized,
        countryCode,
        artifactType,
        originalName: file.name,
        contentType: file.type,
        contentBase64,
        idempotencyKey: `${file.name}-${file.size}-${file.lastModified}`,
      });
      if (!result.ok) {
        setUploadError(result.error || 'Upload failed.');
        setUploading(false);
        return;
      }
      await loadInitial('refresh');
      setUploading(false);
    },
    [countryCode, getAccessToken, loadInitial, onUnauthorized, session.status],
  );

  useEffect(() => {
    void loadInitial('initial');
  }, [countryCode, session.status, loadInitial]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return (
      <CustomerShell apiReachable={true} countryLabel={countryCode}>
        <EmptyState title="Sign in required" description="Sign in with OTP to view your health timeline." />
      </CustomerShell>
    );
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  return (
    <CustomerShell apiReachable={true} countryLabel={countryCode}>
      <Heading level={2}>Health</Heading>
      <Text tone="secondary">
        Your health timeline shows published records from connected care services. Clinical details appear only on
        authorized record pages.
      </Text>
      <Link href="/account/consent">
        <Button variant="tertiary" size="sm">
          Manage consent
        </Button>
      </Link>
      <Link href="/health/care-navigation">
        <Button variant="secondary" size="sm">
          Care navigation
        </Button>
      </Link>
      <FormField label="Country code">
        {({ id }) => (
          <input
            id={id}
            className="wp-input"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
            onBlur={() => void loadInitial('initial')}
            aria-label="Health country code"
          />
        )}
      </FormField>
      <Button variant="secondary" size="sm" disabled={loading || refreshing} onClick={() => void loadInitial('refresh')}>
        {refreshing ? 'Refreshing…' : 'Refresh timeline'}
      </Button>
      <FormField label="Upload health document (PDF/JPEG/PNG, max 10 MB)">
        {({ id }) => (
          <input
            id={id}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            disabled={uploading}
            aria-label="Upload health document"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void onUploadFile(file);
                e.target.value = '';
              }
            }}
          />
        )}
      </FormField>
      {uploading ? <LoadingState label="Uploading document" /> : null}
      {uploadError ? <Text tone="secondary">{uploadError}</Text> : null}

      {loading ? <LoadingState label="Loading health timeline" /> : null}

      {!loading && error === 'unauthorized' ? (
        <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />
      ) : null}
      {!loading && error === 'forbidden' ? <PermissionDeniedState /> : null}
      {!loading && error === 'disabled' ? (
        <EmptyState
          title="Health timeline unavailable"
          description="Health timeline is not enabled for the selected country. Try another country code or contact support."
          action={{ label: 'Retry', onClick: () => void loadInitial('initial') }}
        />
      ) : null}
      {!loading && error === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadInitial('initial') }} />
      ) : null}
      {!loading && error === 'generic' ? (
        <EmptyState
          title="Could not load timeline"
          description="An unexpected error occurred while loading your health timeline."
          action={{ label: 'Retry', onClick: () => void loadInitial('initial') }}
        />
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="No health records yet"
          description="Published lab, imaging, and other health records will appear here when available."
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <div className="wp-stack">
          {groupTimelineByDate(items).map((group) => (
            <section key={group.dateKey} aria-label={group.heading}>
              <Heading level={3}>{group.heading}</Heading>
              {group.items.map((item) => (
                <TimelineEventCard key={item.id} item={item} />
              ))}
            </section>
          ))}
          {nextCursor ? (
            <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'Loading more…' : 'Load more'}
            </Button>
          ) : null}
          {moreError === 'network' ? (
            <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadMore() }} />
          ) : null}
          {moreError === 'generic' ? (
            <EmptyState
              title="Could not load more"
              description="An unexpected error occurred while loading additional timeline events."
              action={{ label: 'Retry', onClick: () => void loadMore() }}
            />
          ) : null}
        </div>
      ) : null}
    </CustomerShell>
  );
}

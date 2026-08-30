'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  fetchDoctorPatientTimeline,
  type HealthTimelineItem,
} from './health-api';
import {
  classifyDoctorHealthFailure,
  formatArtifactType,
  formatWhen,
  shortPatientId,
  type DoctorHealthViewError,
} from './health-utils';

function TimelineCard({ patientPersonId, countryCode, item }: { patientPersonId: string; countryCode: string; item: HealthTimelineItem }) {
  const body = (
    <Card>
      <Text>{item.title}</Text>
      <Text size="caption" tone="secondary">
        {formatWhen(item.occurred_at)} · {formatArtifactType(item.artifact_type)} · {item.status}
      </Text>
    </Card>
  );
  if (!item.artifact_id) {
    return body;
  }
  return (
    <Link
      href={`/patients/${patientPersonId}/health/artifacts/${item.artifact_id}?country=${countryCode}`}
      aria-label={`View ${item.title}`}
    >
      {body}
    </Link>
  );
}

export function DoctorPatientHealthPanel({
  patientPersonId,
  countryCode = 'XX',
}: {
  patientPersonId: string;
  countryCode?: string;
}) {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [items, setItems] = useState<HealthTimelineItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<DoctorHealthViewError | null>(null);

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const load = useCallback(
    async (cursor?: string) => {
      const token = getAccessToken();
      if (!token || session.status !== 'authenticated') {
        return;
      }
      if (cursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }
      const result = await fetchDoctorPatientTimeline({
        token,
        onUnauthorized,
        patientPersonId,
        countryCode,
        cursor,
      });
      if (result.ok) {
        setItems((current) => (cursor ? [...current, ...result.data.items] : result.data.items));
        setNextCursor(result.data.next_cursor);
        setError(null);
      } else {
        if (!cursor) {
          setItems([]);
          setError(classifyDoctorHealthFailure(result));
        }
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [countryCode, getAccessToken, onUnauthorized, patientPersonId, session.status],
  );

  useEffect(() => {
    void load();
  }, [load]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (loading) {
    return <LoadingState label="Loading patient health timeline" />;
  }

  if (error === 'unauthorized') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }
  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (error === 'consent_revoked') {
    return (
      <EmptyState
        title="Consent revoked"
        description="The patient has revoked consent for health record access."
      />
    );
  }
  if (error === 'consent_expired') {
    return <EmptyState title="Consent expired" description="Patient consent for health access has expired." />;
  }
  if (error === 'consent_required') {
    return (
      <EmptyState
        title="Consent required"
        description="Active patient consent is required before you can view this health timeline."
      />
    );
  }
  if (error === 'disabled') {
    return (
      <EmptyState
        title="Health timeline unavailable"
        description="Health timeline is not enabled for this country."
      />
    );
  }
  if (error === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }
  if (error === 'not_found') {
    return <EmptyState title="Patient not found" description="This patient health record is unavailable." />;
  }
  if (error === 'generic') {
    return <EmptyState title="Could not load timeline" description="An unexpected error occurred." />;
  }

  return (
    <section className="wp-stack">
      <Link href="/patients">
        <Button variant="tertiary" size="sm">
          Back to patient selection
        </Button>
      </Link>
      <Heading level={2}>Patient {shortPatientId(patientPersonId)}</Heading>
      <Text tone="secondary">Country {countryCode} · metadata only until you open a report</Text>
      {items.length === 0 ? (
        <EmptyState title="No health records" description="Published health artifacts will appear here when consented." />
      ) : (
        items.map((item) => (
          <TimelineCard key={item.id} patientPersonId={patientPersonId} countryCode={countryCode} item={item} />
        ))
      )}
      {nextCursor ? (
        <Button variant="secondary" disabled={loadingMore} onClick={() => void load(nextCursor)}>
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </section>
  );
}

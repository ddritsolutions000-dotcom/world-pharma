'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
} from '@world-pharma/ui-kit/web';
import {
  fetchImagingViewerFrameBlob,
  fetchImagingViewerSession,
  ImagingCustomerApiError,
} from './imaging-api';
import {
  ImagingDiagnosticViewerPanel,
  type DiagnosticViewerSession,
} from './imaging-diagnostic-viewer';
import { MgBackLink, Page, ServiceHero } from './ui/mg-ui';

export function ImagingBookingViewerScreen({ bookingId }: { bookingId: string }) {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [viewerSession, setViewerSession] = useState<DiagnosticViewerSession | null>(null);
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden'
  >('idle');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      expire();
      return;
    }
    setLoadState('loading');
    setErrorDetail(null);
    try {
      const body = await fetchImagingViewerSession(token, bookingId);
      setViewerSession(body);
      setLoadState(body.series?.length ? 'ready' : 'empty');
    } catch (err) {
      if (err instanceof ImagingCustomerApiError) {
        if (err.status === 401) {
          expire();
          return;
        }
        if (err.status === 403) {
          setLoadState('forbidden');
          return;
        }
        if (err.status === 404) {
          setLoadState('empty');
          setErrorDetail(err.message);
          return;
        }
        setErrorDetail(err.message);
      }
      setLoadState('error');
    }
  }, [bookingId, expire, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated') void load();
  }, [load, session.status]);

  const fetchFrameBlob = useCallback(
    async (seriesId: string, frameIndex: number) => {
      const token = getAccessToken();
      if (!token) {
        expire();
        throw new ImagingCustomerApiError('session_expired', 401);
      }
      return fetchImagingViewerFrameBlob(token, bookingId, seriesId, frameIndex);
    },
    [bookingId, expire, getAccessToken],
  );

  if (session.status === 'anonymous') {
    return <SessionExpiredState onSignIn={() => void signOut()} />;
  }

  return (
    <Page>
      <MgBackLink href={`/radiology/bookings/${bookingId}`}>← Booking</MgBackLink>
      <ServiceHero
        kicker="Study images"
        title="Diagnostic viewer"
        subtitle="Study images — separate from the written radiology report."
        tone="scan"
        compact
      />
      {loadState === 'forbidden' ? <PermissionDeniedState /> : null}
      {loadState === 'error' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />
      ) : null}
      {loadState === 'empty' && !viewerSession ? (
        <EmptyState
          title="Study not viewable"
          description={errorDetail ?? 'No imaging frames are available yet.'}
        />
      ) : (
        <ImagingDiagnosticViewerPanel
          session={viewerSession}
          loadState={loadState === 'forbidden' || loadState === 'error' ? loadState : loadState}
          errorDetail={errorDetail}
          onRetry={() => void load()}
          fetchFrameBlob={fetchFrameBlob}
          backHref={`/radiology/bookings/${bookingId}`}
          backLabel="← Booking / report"
          reportHref={`/radiology/bookings/${bookingId}`}
        />
      )}
    </Page>
  );
}

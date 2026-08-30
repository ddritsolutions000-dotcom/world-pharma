'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
import {
  fetchHealthArtifactMetadata,
  fetchHealthArtifactPayload,
  type HealthArtifactMetadata,
  type HealthArtifactPayload,
} from './health-api';
import { HealthReportContent } from './health-report-content';
import {
  classifyHealthApiFailure,
  formatArtifactType,
  formatSourceModule,
  formatWhen,
  type HealthViewError,
} from './health-utils';

const DEFAULT_COUNTRY = 'XX';

export function HealthArtifactScreen() {
  const params = useParams<{ id: string }>();
  const artifactId = params?.id ?? '';
  const { session, getAccessToken, signOut, expire } = useSession();
  const [metadata, setMetadata] = useState<HealthArtifactMetadata | null>(null);
  const [payload, setPayload] = useState<HealthArtifactPayload | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [metaError, setMetaError] = useState<HealthViewError | null>(null);
  const [payloadError, setPayloadError] = useState<HealthViewError | null>(null);
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY);

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const loadMetadata = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !artifactId || session.status !== 'authenticated') {
      return;
    }
    setMetaLoading(true);
    setMetaError(null);
    setMetadata(null);
    setPayload(null);
    setPayloadError(null);

    const result = await fetchHealthArtifactMetadata({
      token,
      onUnauthorized,
      countryCode,
      artifactId,
    });

    if (result.ok) {
      setMetadata(result.data);
      setMetaError(null);
    } else {
      setMetadata(null);
      setMetaError(classifyHealthApiFailure(result));
    }
    setMetaLoading(false);
    return result.ok ? result.data : null;
  }, [artifactId, countryCode, getAccessToken, onUnauthorized, session.status]);

  const loadPayload = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !artifactId) {
      return;
    }
    setPayloadLoading(true);
    setPayloadError(null);
    setPayload(null);

    const result = await fetchHealthArtifactPayload({
      token,
      onUnauthorized,
      countryCode,
      artifactId,
    });

    if (result.ok) {
      setPayload(result.data);
      setPayloadError(null);
    } else {
      setPayload(null);
      setPayloadError(classifyHealthApiFailure(result));
    }
    setPayloadLoading(false);
  }, [artifactId, countryCode, getAccessToken, onUnauthorized]);

  useEffect(() => {
    void (async () => {
      const meta = await loadMetadata();
      if (meta?.payload_available) {
        await loadPayload();
      }
    })();
  }, [artifactId, countryCode, session.status]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return (
      <CustomerShell apiReachable={true} countryLabel={countryCode}>
        <EmptyState title="Sign in required" description="Sign in with OTP to view this health record." />
      </CustomerShell>
    );
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  if (!artifactId) {
    return (
      <CustomerShell apiReachable={true} countryLabel={countryCode}>
        <EmptyState title="Record unavailable" description="No health record was specified." />
      </CustomerShell>
    );
  }

  const sourceLabel = formatSourceModule(metadata?.source_module);

  return (
    <CustomerShell apiReachable={true} countryLabel={countryCode}>
      <Link href="/health">
        <Button variant="tertiary" size="sm">
          Back to health timeline
        </Button>
      </Link>
      <Heading level={2}>Health record</Heading>
      <FormField label="Country code">
        {({ id }) => (
          <input
            id={id}
            className="wp-input"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
            onBlur={() => void loadMetadata()}
            aria-label="Health country code"
          />
        )}
      </FormField>

      {metaLoading ? <LoadingState label="Loading record details" /> : null}

      {!metaLoading && metaError === 'unauthorized' ? (
        <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />
      ) : null}
      {!metaLoading && metaError === 'forbidden' ? <PermissionDeniedState /> : null}
      {!metaLoading && metaError === 'disabled' ? (
        <EmptyState
          title="Health timeline unavailable"
          description="Health timeline is not enabled for the selected country."
        />
      ) : null}
      {!metaLoading && metaError === 'not_found' ? (
        <EmptyState
          title="Record not found"
          description="This health record is unavailable or no longer exists."
        />
      ) : null}
      {!metaLoading && metaError === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadMetadata() }} />
      ) : null}
      {!metaLoading && metaError === 'generic' ? (
        <EmptyState
          title="Could not load record"
          description="An unexpected error occurred while loading this health record."
        />
      ) : null}

      {!metaLoading && !metaError && metadata ? (
        <Card>
          <Heading level={3}>{metadata.title}</Heading>
          <Text size="caption" tone="secondary">
            {formatArtifactType(metadata.artifact_type)}
            {sourceLabel ? ` · ${sourceLabel}` : ''} · {metadata.status}
          </Text>
          <Text size="caption">Published {formatWhen(metadata.published_at)}</Text>
          {metadata.sandbox ? <Text size="caption">Sandbox record</Text> : null}
          {!metadata.payload_available ? (
            <Text size="caption">Report content is not available for this record.</Text>
          ) : null}
        </Card>
      ) : null}

      {!metaLoading && !metaError && metadata?.payload_available ? (
        <>
          {payloadLoading ? <LoadingState label="Loading report content" /> : null}
          {!payloadLoading && payloadError === 'forbidden' ? <PermissionDeniedState /> : null}
          {!payloadLoading && payloadError === 'consent_revoked' ? (
            <EmptyState
              title="Consent revoked"
              description="Access to this report was revoked. Grant consent again if your care team still needs access."
            />
          ) : null}
          {!payloadLoading && payloadError === 'consent_expired' ? (
            <EmptyState
              title="Consent expired"
              description="Consent for this report has expired. Renew consent from account settings if needed."
            />
          ) : null}
          {!payloadLoading && payloadError === 'consent_required' ? (
            <EmptyState
              title="Consent required"
              description="Clinical access to this report requires active consent."
            />
          ) : null}
          {!payloadLoading && payloadError === 'not_found' ? (
            <EmptyState
              title="Report not available"
              description="The report is not published yet or is no longer available."
            />
          ) : null}
          {!payloadLoading && payloadError === 'network' ? (
            <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadPayload() }} />
          ) : null}
          {!payloadLoading && payloadError === 'generic' ? (
            <EmptyState title="Could not load report" description="An unexpected error occurred." />
          ) : null}
          {!payloadLoading && !payloadError && payload ? <HealthReportContent payload={payload} /> : null}
          {!payloadLoading && !payload && !payloadError ? (
            <Button variant="secondary" size="sm" onClick={() => void loadPayload()}>
              Load report content
            </Button>
          ) : null}
        </>
      ) : null}
    </CustomerShell>
  );
}

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
  fetchDoctorArtifactMetadata,
  fetchDoctorArtifactPayload,
  type HealthArtifactMetadata,
  type HealthArtifactPayload,
} from './health-api';
import { HealthReportContent } from './health-report-content';
import {
  classifyDoctorHealthFailure,
  formatArtifactType,
  formatWhen,
  shortPatientId,
  type DoctorHealthViewError,
} from './health-utils';

export function DoctorPatientHealthArtifactPanel({
  patientPersonId,
  artifactId,
  countryCode = 'XX',
}: {
  patientPersonId: string;
  artifactId: string;
  countryCode?: string;
}) {
  const { session, getAccessToken, signOut, expire } = useSession();
  const [metadata, setMetadata] = useState<HealthArtifactMetadata | null>(null);
  const [payload, setPayload] = useState<HealthArtifactPayload | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [metaError, setMetaError] = useState<DoctorHealthViewError | null>(null);
  const [payloadError, setPayloadError] = useState<DoctorHealthViewError | null>(null);

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const loadMetadata = useCallback(async () => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setMetaLoading(true);
    setMetaError(null);
    setMetadata(null);
    setPayload(null);
    setPayloadError(null);
    const result = await fetchDoctorArtifactMetadata({
      token,
      onUnauthorized,
      patientPersonId,
      artifactId,
      countryCode,
    });
    if (result.ok) {
      setMetadata(result.data);
    } else {
      setMetaError(classifyDoctorHealthFailure(result));
    }
    setMetaLoading(false);
    return result.ok ? result.data : null;
  }, [artifactId, countryCode, getAccessToken, onUnauthorized, patientPersonId, session.status]);

  const loadPayload = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setPayloadLoading(true);
    setPayloadError(null);
    setPayload(null);
    const result = await fetchDoctorArtifactPayload({
      token,
      onUnauthorized,
      patientPersonId,
      artifactId,
      countryCode,
    });
    if (result.ok) {
      setPayload(result.data);
    } else {
      setPayloadError(classifyDoctorHealthFailure(result));
    }
    setPayloadLoading(false);
  }, [artifactId, countryCode, getAccessToken, onUnauthorized, patientPersonId]);

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

  const consentState = (error: DoctorHealthViewError | null) => {
    if (error === 'consent_revoked') {
      return (
        <EmptyState title="Consent revoked" description="The patient revoked consent for this health record." />
      );
    }
    if (error === 'consent_expired') {
      return <EmptyState title="Consent expired" description="Patient consent for this record has expired." />;
    }
    if (error === 'consent_required') {
      return <EmptyState title="Consent required" description="Active patient consent is required to view this report." />;
    }
    return null;
  };

  return (
    <section className="wp-stack">
      <Link href={`/patients/${patientPersonId}/health?country=${countryCode}`}>
        <Button variant="tertiary" size="sm">
          Back to timeline
        </Button>
      </Link>
      <Heading level={2}>Health record</Heading>
      <Text tone="secondary">Patient {shortPatientId(patientPersonId)}</Text>

      {metaLoading ? <LoadingState label="Loading record details" /> : null}
      {!metaLoading && metaError === 'unauthorized' ? (
        <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />
      ) : null}
      {!metaLoading && metaError === 'forbidden' ? <PermissionDeniedState /> : null}
      {!metaLoading && consentState(metaError)}
      {!metaLoading && metaError === 'disabled' ? (
        <EmptyState title="Health timeline unavailable" description="Health timeline is not enabled for this country." />
      ) : null}
      {!metaLoading && metaError === 'not_found' ? (
        <EmptyState title="Record not found" description="This health record is unavailable." />
      ) : null}
      {!metaLoading && metaError === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadMetadata() }} />
      ) : null}
      {!metaLoading && metaError === 'generic' ? (
        <EmptyState title="Could not load record" description="An unexpected error occurred." />
      ) : null}

      {!metaLoading && !metaError && metadata ? (
        <Card>
          <Heading level={3}>{metadata.title}</Heading>
          <Text size="caption" tone="secondary">
            {formatArtifactType(metadata.artifact_type)} · {metadata.status}
          </Text>
          <Text size="caption">Published {formatWhen(metadata.published_at)}</Text>
        </Card>
      ) : null}

      {!metaLoading && !metaError && metadata?.payload_available ? (
        <>
          {payloadLoading ? <LoadingState label="Loading report content" /> : null}
          {!payloadLoading && payloadError === 'forbidden' ? <PermissionDeniedState /> : null}
          {!payloadLoading && consentState(payloadError)}
          {!payloadLoading && payloadError === 'network' ? (
            <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadPayload() }} />
          ) : null}
          {!payloadLoading && payloadError === 'not_found' ? (
            <EmptyState title="Report not available" description="The report is not published or is unavailable." />
          ) : null}
          {!payloadLoading && !payloadError && payload ? <HealthReportContent payload={payload} /> : null}
          {!payloadLoading && !payload && !payloadError ? (
            <Button variant="secondary" size="sm" onClick={() => void loadPayload()}>
              Load report content
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

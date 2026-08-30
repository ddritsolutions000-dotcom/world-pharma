import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeInput,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativePermissionDeniedState,
  NativeSessionExpiredState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import {
  fetchDoctorArtifactMetadata,
  fetchDoctorArtifactPayload,
  fetchDoctorHealthPatients,
  fetchDoctorPatientTimeline,
  type DoctorHealthPatient,
  type HealthArtifactMetadata,
  type HealthArtifactPayload,
  type HealthTimelineItem,
} from './health-api';
import {
  classifyDoctorHealthFailure,
  formatArtifactType,
  formatWhen,
  shortPatientId,
  type DoctorHealthViewError,
} from './health-utils';

const DEFAULT_COUNTRY = 'XX';

function HealthErrorState({
  error,
  onRetry,
  onBack,
}: {
  error: DoctorHealthViewError;
  onRetry?: () => void;
  onBack?: () => void;
}) {
  if (error === 'unauthorized') {
    return <NativeSessionExpiredState onAction={onBack} />;
  }
  if (error === 'forbidden') {
    return <NativePermissionDeniedState />;
  }
  if (error === 'consent_revoked') {
    return (
      <NativeEmptyState
        title="Consent revoked"
        description="The patient revoked consent for health record access."
      />
    );
  }
  if (error === 'consent_expired') {
    return <NativeEmptyState title="Consent expired" description="Patient consent for health access has expired." />;
  }
  if (error === 'consent_required') {
    return (
      <NativeEmptyState
        title="Consent required"
        description="Active patient consent is required before viewing health records."
      />
    );
  }
  if (error === 'disabled') {
    return (
      <NativeEmptyState
        title="Health unavailable"
        description="Health timeline is not enabled for this country."
      />
    );
  }
  if (error === 'not_found') {
    return <NativeEmptyState title="Not found" description="This health record is unavailable." />;
  }
  if (error === 'network') {
    return <NativeNetworkErrorState onRetry={onRetry} />;
  }
  return <NativeEmptyState title="Could not load" description="An unexpected error occurred." />;
}

function HealthReportBody({ payload }: { payload: HealthArtifactPayload }) {
  if (payload.artifact_type === 'LAB_REPORT' && payload.payload.results?.length) {
    return (
      <NativeCard>
        <NativeText variant="h2">Lab diagnostic report</NativeText>
        {payload.payload.summary ? <NativeText>{payload.payload.summary}</NativeText> : null}
        {payload.payload.results.map((line) => (
          <NativeText key={`${line.analyte_name}-${line.value}`} variant="caption">
            {`${line.analyte_name}: ${line.value}${line.unit ? ` ${line.unit}` : ''}`}
          </NativeText>
        ))}
        {payload.payload.note ? <NativeText variant="caption">{payload.payload.note}</NativeText> : null}
      </NativeCard>
    );
  }
  if (payload.artifact_type === 'IMAGING_REPORT' && payload.payload.findings?.length) {
    return (
      <NativeCard>
        <NativeText variant="h2">Imaging report</NativeText>
        {payload.payload.summary ? <NativeText>{payload.payload.summary}</NativeText> : null}
        {payload.payload.findings.map((line) => (
          <NativeText key={`${line.finding_code}-${line.finding_text}`} variant="caption">
            {`${line.finding_code}: ${line.finding_text}`}
          </NativeText>
        ))}
        {payload.payload.note ? <NativeText variant="caption">{payload.payload.note}</NativeText> : null}
      </NativeCard>
    );
  }
  if (payload.artifact_type === 'PRESCRIPTION_STRUCTURED' && payload.payload.lines?.length) {
    return (
      <NativeCard>
        <NativeText variant="h2">Prescription</NativeText>
        <NativeText variant="caption">{`Version ${payload.payload.version_number ?? '—'}`}</NativeText>
        {payload.payload.lines.map((line, index) => (
          <NativeText key={`${line.clinical_concept_label}-${index}`} variant="caption">
            {`${line.clinical_concept_label} · ${line.dosage_instructions}${line.quantity_authorized ? ` · qty ${line.quantity_authorized}` : ''}`}
          </NativeText>
        ))}
      </NativeCard>
    );
  }
  return (
    <NativeCard>
      <NativeText variant="caption">Report content is not available in a recognized format.</NativeText>
    </NativeCard>
  );
}

export function DoctorHealthPatientPicker({
  token,
  countryCode,
  onUnauthorized,
  onSelectPatient,
}: {
  token: string;
  countryCode: string;
  onUnauthorized: () => void;
  onSelectPatient: (patientPersonId: string) => void;
}) {
  const [patients, setPatients] = useState<DoctorHealthPatient[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DoctorHealthViewError | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedId('');
    const result = await fetchDoctorHealthPatients({ token, onUnauthorized, countryCode });
    if (result.ok) {
      setPatients(result.data.patients ?? []);
    } else {
      setError(classifyDoctorHealthFailure(result));
    }
    setLoading(false);
  }, [countryCode, onUnauthorized, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <NativeLoadingState title="Loading patients" />;
  }
  if (error) {
    return <HealthErrorState error={error} onRetry={() => void load()} />;
  }
  if (!patients.length) {
    return (
      <NativeEmptyState
        title="No patients available"
        description="Active clinical relationships for this country will appear here."
      />
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <NativeText variant="caption">
        Select a patient explicitly. Health records require valid patient consent.
      </NativeText>
      {patients.map((row) => (
        <NativeCard key={row.patient_person_id}>
          <NativeText>{`${shortPatientId(row.patient_person_id)} · ${row.kind} · ${row.status}`}</NativeText>
          <NativeButton
            label={selectedId === row.patient_person_id ? 'Selected' : 'Select patient'}
            variant={selectedId === row.patient_person_id ? 'primary' : 'secondary'}
            onPress={() => setSelectedId(row.patient_person_id)}
          />
        </NativeCard>
      ))}
      <NativeButton
        label="Open health timeline"
        disabled={!selectedId}
        onPress={() => {
          if (selectedId) {
            onSelectPatient(selectedId);
          }
        }}
      />
    </View>
  );
}

export function DoctorHealthTimelineScreen({
  token,
  patientPersonId,
  countryCode,
  onUnauthorized,
  onOpenArtifact,
  onBack,
}: {
  token: string;
  patientPersonId: string;
  countryCode: string;
  onUnauthorized: () => void;
  onOpenArtifact: (artifactId: string) => void;
  onBack: () => void;
}) {
  const [items, setItems] = useState<HealthTimelineItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<DoctorHealthViewError | null>(null);

  const load = useCallback(
    async (cursor?: string) => {
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
      } else if (!cursor) {
        setItems([]);
        setError(classifyDoctorHealthFailure(result));
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [countryCode, onUnauthorized, patientPersonId, token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ gap: 8 }}>
      <NativeButton label="Back to patient selection" variant="secondary" onPress={onBack} />
      <NativeText variant="h2">{`Patient ${shortPatientId(patientPersonId)}`}</NativeText>
      <NativeText variant="caption">{`Country ${countryCode} · metadata only`}</NativeText>
      {loading ? <NativeLoadingState title="Loading timeline" /> : null}
      {!loading && error ? <HealthErrorState error={error} onRetry={() => void load()} onBack={onBack} /> : null}
      {!loading && !error && !items.length ? (
        <NativeEmptyState
          title="No health records"
          description="Published health artifacts will appear here when consented."
        />
      ) : null}
      {!loading && !error
        ? items.map((item) => (
            <NativeCard key={item.id}>
              <NativeText>{item.title}</NativeText>
              <NativeText variant="caption">
                {`${formatWhen(item.occurred_at)} · ${formatArtifactType(item.artifact_type)} · ${item.status}`}
              </NativeText>
              {item.artifact_id ? (
                <NativeButton
                  label="View record"
                  variant="secondary"
                  onPress={() => onOpenArtifact(item.artifact_id!)}
                />
              ) : null}
            </NativeCard>
          ))
        : null}
      {nextCursor ? (
        <NativeButton
          label={loadingMore ? 'Loading…' : 'Load more'}
          variant="secondary"
          onPress={() => void load(nextCursor)}
        />
      ) : null}
    </View>
  );
}

export function DoctorHealthArtifactScreen({
  token,
  patientPersonId,
  artifactId,
  countryCode,
  onUnauthorized,
  onBack,
}: {
  token: string;
  patientPersonId: string;
  artifactId: string;
  countryCode: string;
  onUnauthorized: () => void;
  onBack: () => void;
}) {
  const [metadata, setMetadata] = useState<HealthArtifactMetadata | null>(null);
  const [payload, setPayload] = useState<HealthArtifactPayload | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [metaError, setMetaError] = useState<DoctorHealthViewError | null>(null);
  const [payloadError, setPayloadError] = useState<DoctorHealthViewError | null>(null);

  const loadMetadata = useCallback(async () => {
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
      setMetaLoading(false);
      return result.data;
    }
    setMetaError(classifyDoctorHealthFailure(result));
    setMetaLoading(false);
    return null;
  }, [artifactId, countryCode, onUnauthorized, patientPersonId, token]);

  const loadPayload = useCallback(async () => {
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
  }, [artifactId, countryCode, onUnauthorized, patientPersonId, token]);

  useEffect(() => {
    void (async () => {
      const meta = await loadMetadata();
      if (meta?.payload_available) {
        await loadPayload();
      }
    })();
  }, [artifactId, countryCode, loadMetadata, loadPayload]);

  return (
    <View style={{ gap: 8 }}>
      <NativeButton label="Back to timeline" variant="secondary" onPress={onBack} />
      <NativeText variant="h2">Health record</NativeText>
      <NativeText variant="caption">{`Patient ${shortPatientId(patientPersonId)}`}</NativeText>
      {metaLoading ? <NativeLoadingState title="Loading record" /> : null}
      {!metaLoading && metaError ? (
        <HealthErrorState error={metaError} onRetry={() => void loadMetadata()} onBack={onBack} />
      ) : null}
      {!metaLoading && !metaError && metadata ? (
        <NativeCard>
          <NativeText>{metadata.title}</NativeText>
          <NativeText variant="caption">
            {`${formatArtifactType(metadata.artifact_type)} · ${metadata.status}`}
          </NativeText>
          <NativeText variant="caption">{`Published ${formatWhen(metadata.published_at)}`}</NativeText>
        </NativeCard>
      ) : null}
      {!metaLoading && !metaError && metadata?.payload_available ? (
        <>
          {payloadLoading ? <NativeLoadingState title="Loading report" /> : null}
          {!payloadLoading && payloadError ? (
            <HealthErrorState error={payloadError} onRetry={() => void loadPayload()} onBack={onBack} />
          ) : null}
          {!payloadLoading && !payloadError && payload ? <HealthReportBody payload={payload} /> : null}
          {!payloadLoading && !payload && !payloadError ? (
            <NativeButton label="Load report content" variant="secondary" onPress={() => void loadPayload()} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function DoctorHealthCountryInput({
  countryCode,
  onChange,
}: {
  countryCode: string;
  onChange: (value: string) => void;
}) {
  return <NativeInput label="Country code" value={countryCode} onChangeText={(value) => onChange(value.toUpperCase())} />;
}

export { DEFAULT_COUNTRY };

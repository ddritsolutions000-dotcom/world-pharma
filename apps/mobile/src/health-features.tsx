import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  NativeButton,
  NativeCard,
  NativeEmptyState,
  NativeLoadingState,
  NativeNetworkErrorState,
  NativePermissionDeniedState,
  NativeText,
} from '@world-pharma/ui-kit/native';
import {
  fetchHealthArtifactMetadata,
  fetchHealthArtifactPayload,
  fetchHealthTimeline,
  type HealthArtifactMetadata,
  type HealthArtifactPayload,
  type HealthTimelineItem,
  type ImagingHealthPayload,
  type LabHealthPayload,
} from './health-api';
import { performHealthDocumentUpload } from './health-upload-flow';
import {
  HEALTH_UPLOAD_BUTTON_LABEL,
  prependUploadTimelineItem,
  timelineItemFromUploadResponse,
} from './health-upload-utils';
import {
  classifyHealthApiFailure,
  formatArtifactType,
  formatSourceModule,
  formatWhen,
  groupTimelineByDate,
  type HealthViewError,
} from './health-utils';
import type { FeatureCtx } from './customer-features';

export { HEALTH_UPLOAD_BUTTON_LABEL } from './health-upload-utils';

const HEALTH_COUNTRY = 'XX';

function FeatureStates({
  viewState,
  onRetry,
}: {
  viewState: FeatureCtx['viewState'];
  onRetry?: () => void;
}) {
  if (viewState === 'loading') {
    return <NativeLoadingState title="Loading" />;
  }
  if (viewState === 'network') {
    return <NativeNetworkErrorState onRetry={onRetry} />;
  }
  if (viewState === 'forbidden') {
    return <NativePermissionDeniedState />;
  }
  return null;
}

function HealthReportBody({ payload }: { payload: HealthArtifactPayload }) {
  if (payload.artifact_type === 'LAB_REPORT') {
    const report = payload.payload as LabHealthPayload;
    return (
      <NativeCard>
        <NativeText variant="h2">Diagnostic report</NativeText>
        <NativeText variant="caption">{`Accession ${report.accession_number} · v${report.version_number}`}</NativeText>
        {report.summary ? <NativeText>{report.summary}</NativeText> : null}
        {report.results.map((line) => (
          <View key={`${line.analyte_name}-${line.value}`}>
            <NativeText variant="caption">
              {`${line.analyte_name}: ${line.value}${line.unit ? ` ${line.unit}` : ''}`}
            </NativeText>
          </View>
        ))}
        {report.note ? <NativeText variant="caption">{report.note}</NativeText> : null}
      </NativeCard>
    );
  }
  if (payload.artifact_type === 'IMAGING_REPORT') {
    const report = payload.payload as ImagingHealthPayload;
    return (
      <NativeCard>
        <NativeText variant="h2">Imaging report</NativeText>
        <NativeText variant="caption">
          {report.accession_number
            ? `Accession ${report.accession_number} · v${report.version_number}`
            : `Version ${report.version_number}`}
        </NativeText>
        {report.summary ? <NativeText>{report.summary}</NativeText> : null}
        {report.amendment_reason ? (
          <NativeText variant="caption">{`Amendment: ${report.amendment_reason}`}</NativeText>
        ) : null}
        {report.findings.map((line) => (
          <View key={`${line.finding_code}-${line.finding_text}`}>
            <NativeText variant="caption">{`${line.finding_code}: ${line.finding_text}`}</NativeText>
          </View>
        ))}
        {report.note ? <NativeText variant="caption">{report.note}</NativeText> : null}
      </NativeCard>
    );
  }
  if (payload.artifact_type === 'PRESCRIPTION_STRUCTURED') {
    const report = payload.payload as {
      version_number?: number;
      lines?: Array<{ clinical_concept_label: string; dosage_instructions: string; quantity_authorized?: string }>;
    };
    return (
      <NativeCard>
        <NativeText variant="h2">Prescription</NativeText>
        <NativeText variant="caption">{`Version ${report.version_number ?? '—'}`}</NativeText>
        {(report.lines ?? []).map((line, index) => (
          <View key={`${line.clinical_concept_label}-${index}`}>
            <NativeText variant="caption">
              {`${line.clinical_concept_label} · ${line.dosage_instructions}${line.quantity_authorized ? ` · qty ${line.quantity_authorized}` : ''}`}
            </NativeText>
          </View>
        ))}
      </NativeCard>
    );
  }
  if (payload.artifact_type === 'DOCUMENT' || payload.artifact_type === 'PRESCRIPTION_UPLOAD') {
    const upload = payload.payload as {
      original_name: string;
      content_type: string;
      byte_size: number;
      uploaded_at: string;
    };
    return (
      <NativeCard>
        <NativeText variant="h2">
          {payload.artifact_type === 'DOCUMENT' ? 'Uploaded document' : 'Uploaded prescription'}
        </NativeText>
        <NativeText variant="caption">
          {`${upload.original_name} · ${upload.content_type} · ${upload.byte_size} bytes`}
        </NativeText>
        <NativeText variant="caption">{`Uploaded ${formatWhen(upload.uploaded_at)}`}</NativeText>
        <NativeText variant="caption">
          This upload is stored securely and is not used for automated diagnosis or prescribing.
        </NativeText>
      </NativeCard>
    );
  }
  return null;
}

function TimelineRow({
  item,
  onOpen,
}: {
  item: HealthTimelineItem;
  onOpen: (artifactId: string) => void;
}) {
  const source = formatSourceModule(item.source_module);
  const typeLabel = formatArtifactType(item.artifact_type);
  return (
    <NativeCard>
      <NativeText>{item.title}</NativeText>
      <NativeText variant="caption">
        {`${formatWhen(item.occurred_at)} · ${typeLabel}${source ? ` · ${source}` : ''} · ${item.status}`}
      </NativeText>
      {item.artifact_id ? (
        <NativeButton
          label="View record"
          variant="secondary"
          onPress={() => onOpen(item.artifact_id!)}
        />
      ) : (
        <NativeText variant="caption">Record details are not available for this event.</NativeText>
      )}
    </NativeCard>
  );
}

export function HealthHomeScreen({
  ctx,
  onOpenConsent,
  onOpenCareNavigation,
  onOpenArtifact,
}: {
  ctx: FeatureCtx;
  onOpenConsent: () => void;
  onOpenCareNavigation: () => void;
  onOpenArtifact: (artifactId: string) => void;
}) {
  const [items, setItems] = useState<HealthTimelineItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageError, setPageError] = useState<HealthViewError | null>(null);
  const [disabledPack, setDisabledPack] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<HealthViewError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const loadInitial = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        ctx.setViewState('loading');
      }
      setPageError(null);
      setDisabledPack(false);
      setMoreError(null);

      const result = await fetchHealthTimeline({
        token: ctx.token,
        onUnauthorized: ctx.onUnauthorized,
        countryCode: HEALTH_COUNTRY,
      });

      if (result.ok) {
        setItems(result.data.items ?? []);
        setNextCursor(result.data.next_cursor);
        ctx.setViewState('idle');
      } else {
        const failure = classifyHealthApiFailure(result);
        setItems([]);
        setNextCursor(null);
        setPageError(failure);
        if (failure === 'disabled') {
          setDisabledPack(true);
          ctx.setViewState('idle');
        } else if (failure === 'forbidden') {
          ctx.setViewState('forbidden');
        } else if (failure === 'unauthorized') {
          ctx.onUnauthorized();
        } else if (failure === 'network') {
          ctx.setViewState('network');
        } else {
          ctx.setViewState('idle');
        }
      }
      setRefreshing(false);
    },
    [ctx],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor) {
      return;
    }
    setLoadingMore(true);
    setMoreError(null);
    const result = await fetchHealthTimeline({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      countryCode: HEALTH_COUNTRY,
      cursor: nextCursor,
    });
    if (result.ok) {
      const pageItems = result.data.items ?? [];
      setItems([...items, ...pageItems]);
      setNextCursor(result.data.next_cursor);
    } else {
      setMoreError(classifyHealthApiFailure(result));
    }
    setLoadingMore(false);
  },     [ctx, items, nextCursor]);

  const onUploadDocument = useCallback(async () => {
    setUploadError(null);
    setUploadSuccess(null);
    setUploading(true);
    try {
      const DocumentPicker = await import('expo-document-picker');
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        base64: true,
        multiple: false,
      });
      if (picked.canceled || !picked.assets?.length) {
        setUploading(false);
        return;
      }
      const asset = picked.assets[0]!;
      if (!asset.base64) {
        setUploadError('Could not read the selected file. Please try again.');
        setUploading(false);
        return;
      }
      const result = await performHealthDocumentUpload({
        token: ctx.token,
        countryCode: HEALTH_COUNTRY,
        onUnauthorized: ctx.onUnauthorized,
        file: {
          name: asset.name,
          mimeType: asset.mimeType ?? 'application/octet-stream',
          size: asset.size ?? asset.base64.length,
          base64: asset.base64,
        },
      });
      if (!result.ok) {
        setUploadError(result.error);
        setUploading(false);
        return;
      }
      const preview = timelineItemFromUploadResponse(result.data);
      setItems((current) => prependUploadTimelineItem(current, preview));
      setUploadSuccess(`${result.data.title} uploaded.`);
      await loadInitial('refresh');
    } catch {
      setUploadError('Upload failed. Please try again.');
    }
    setUploading(false);
  }, [ctx, loadInitial]);

  useEffect(() => {
    void loadInitial('initial');
  }, [loadInitial]);

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back" variant="secondary" onPress={ctx.onBack} />
      <NativeText variant="h2">Health</NativeText>
      <NativeText variant="caption">
        Published health records from connected care services. Clinical details appear only on authorized record pages.
      </NativeText>
      <NativeButton label="Manage consent" variant="secondary" onPress={onOpenConsent} />
      <NativeButton label="Care navigation" variant="secondary" onPress={onOpenCareNavigation} />
      <NativeButton
        label={refreshing ? 'Refreshing…' : 'Refresh timeline'}
        variant="secondary"
        disabled={refreshing || ctx.viewState === 'loading'}
        onPress={() => void loadInitial('refresh')}
      />
      <NativeButton
        label={uploading ? 'Uploading…' : HEALTH_UPLOAD_BUTTON_LABEL}
        variant="secondary"
        disabled={uploading || ctx.viewState === 'loading' || disabledPack}
        onPress={() => void onUploadDocument()}
      />
      {uploading ? <NativeLoadingState title="Uploading document" /> : null}
      {uploadError ? <NativeText variant="caption">{uploadError}</NativeText> : null}
      {uploadSuccess ? <NativeText variant="caption">{uploadSuccess}</NativeText> : null}
      <FeatureStates viewState={ctx.viewState} onRetry={() => void loadInitial('initial')} />

      {ctx.viewState === 'idle' && disabledPack ? (
        <NativeEmptyState
          title="Health timeline unavailable"
          description="Health timeline is not enabled for this country."
        />
      ) : null}

      {ctx.viewState === 'idle' && !disabledPack && pageError === 'generic' ? (
        <NativeEmptyState
          title="Could not load timeline"
          description="An unexpected error occurred while loading your health timeline."
        />
      ) : null}

      {ctx.viewState === 'idle' && !pageError && !disabledPack && items.length === 0 ? (
        <NativeEmptyState
          title="No health records yet"
          description="Published lab, imaging, and other health records will appear here when available."
        />
      ) : null}

      {ctx.viewState === 'idle' && !pageError && !disabledPack && items.length > 0 ? (
        <>
          {groupTimelineByDate(items).map((group) => (
            <View key={group.dateKey} style={{ gap: 8 }}>
              <NativeText variant="h2">{group.heading}</NativeText>
              {group.items.map((item) => (
                <View key={item.id}>
                  <TimelineRow item={item} onOpen={onOpenArtifact} />
                </View>
              ))}
            </View>
          ))}
          {nextCursor ? (
            <NativeButton
              label={loadingMore ? 'Loading more…' : 'Load more'}
              variant="secondary"
              disabled={loadingMore}
              onPress={() => void loadMore()}
            />
          ) : null}
          {moreError === 'network' ? <NativeNetworkErrorState onRetry={() => void loadMore()} /> : null}
          {moreError === 'generic' ? (
            <NativeEmptyState title="Could not load more" description="An unexpected error occurred." />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function HealthArtifactDetailScreen({
  ctx,
  artifactId,
  onBack,
}: {
  ctx: FeatureCtx;
  artifactId: string;
  onBack: () => void;
}) {
  const [metadata, setMetadata] = useState<HealthArtifactMetadata | null>(null);
  const [payload, setPayload] = useState<HealthArtifactPayload | null>(null);
  const [metaError, setMetaError] = useState<HealthViewError | null>(null);
  const [payloadError, setPayloadError] = useState<HealthViewError | null>(null);
  const [payloadLoading, setPayloadLoading] = useState(false);

  const loadPayload = useCallback(async () => {
    setPayloadLoading(true);
    setPayloadError(null);
    setPayload(null);
    const result = await fetchHealthArtifactPayload({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      countryCode: HEALTH_COUNTRY,
      artifactId,
    });
    if (result.ok) {
      setPayload(result.data);
    } else {
      setPayloadError(classifyHealthApiFailure(result));
    }
    setPayloadLoading(false);
  }, [artifactId, ctx]);

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    setMetaError(null);
    setPayloadError(null);
    setMetadata(null);
    setPayload(null);

    const result = await fetchHealthArtifactMetadata({
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      countryCode: HEALTH_COUNTRY,
      artifactId,
    });

    if (!result.ok) {
      const failure = classifyHealthApiFailure(result);
      setMetaError(failure);
      if (failure === 'forbidden') {
        ctx.setViewState('forbidden');
      } else if (failure === 'unauthorized') {
        ctx.onUnauthorized();
      } else if (failure === 'network') {
        ctx.setViewState('network');
      } else {
        ctx.setViewState('idle');
      }
      return;
    }

    setMetadata(result.data);
    ctx.setViewState('idle');
    if (result.data.payload_available) {
      await loadPayload();
    }
  }, [artifactId, ctx, loadPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  const sourceLabel = formatSourceModule(metadata?.source_module);

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="Back to health" variant="secondary" onPress={onBack} />
      <NativeText variant="h2">Health record</NativeText>
      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />

      {ctx.viewState === 'idle' && metaError === 'disabled' ? (
        <NativeEmptyState
          title="Health timeline unavailable"
          description="Health timeline is not enabled for this country."
        />
      ) : null}
      {ctx.viewState === 'idle' && metaError === 'not_found' ? (
        <NativeEmptyState title="Record not found" description="This health record is unavailable." />
      ) : null}
      {ctx.viewState === 'idle' && metaError === 'generic' ? (
        <NativeEmptyState title="Could not load record" description="An unexpected error occurred." />
      ) : null}

      {ctx.viewState === 'idle' && metadata ? (
        <NativeCard>
          <NativeText variant="h2">{metadata.title}</NativeText>
          <NativeText variant="caption">
            {`${formatArtifactType(metadata.artifact_type)}${sourceLabel ? ` · ${sourceLabel}` : ''} · ${metadata.status}`}
          </NativeText>
          <NativeText variant="caption">{`Published ${formatWhen(metadata.published_at)}`}</NativeText>
          {metadata.sandbox ? <NativeText variant="caption">Sandbox record</NativeText> : null}
        </NativeCard>
      ) : null}

      {ctx.viewState === 'idle' && metadata?.payload_available ? (
        <>
          {payloadLoading ? <NativeLoadingState title="Loading report content" /> : null}
          {payloadError === 'forbidden' ? <NativePermissionDeniedState /> : null}
          {payloadError === 'consent_revoked' ? (
            <NativeEmptyState
              title="Consent revoked"
              description="Access to this report was revoked."
            />
          ) : null}
          {payloadError === 'consent_expired' ? (
            <NativeEmptyState title="Consent expired" description="Consent for this report has expired." />
          ) : null}
          {payloadError === 'consent_required' ? (
            <NativeEmptyState title="Consent required" description="Clinical access requires active consent." />
          ) : null}
          {payloadError === 'not_found' ? (
            <NativeEmptyState
              title="Report not available"
              description="The report is not published yet or is no longer available."
            />
          ) : null}
          {payloadError === 'network' ? <NativeNetworkErrorState onRetry={() => void loadPayload()} /> : null}
          {payloadError === 'generic' ? (
            <NativeEmptyState title="Could not load report" description="An unexpected error occurred." />
          ) : null}
          {payload ? <HealthReportBody payload={payload} /> : null}
          {!payloadLoading && !payload && !payloadError ? (
            <NativeButton label="Load report content" variant="secondary" onPress={() => void loadPayload()} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

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
  NativeText,
} from '@world-pharma/ui-kit/native';
import {
  addHealthAllergy,
  addHealthCondition,
  addHealthVital,
  fetchHealthArtifactMetadata,
  fetchHealthArtifactPayload,
  fetchHealthDashboard,
  fetchHealthProfile,
  fetchHealthProfileSubjects,
  fetchHealthTimeline,
  type HealthProfileResponse,
  type HealthSubjectOption,
  upsertHealthEmergencyContact,
  type HealthArtifactMetadata,
  type HealthArtifactPayload,
  type HealthDashboardResponse,
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
  recordLabel,
  recordWhen,
  resolvePendingActionDestination,
  resolveTimelineDestination,
  type HealthViewError,
  type MobileHealthDestination,
} from './health-utils';
import type { FeatureCtx } from './customer-features';
import { NativePageHeader } from './native-screens';

export { HEALTH_UPLOAD_BUTTON_LABEL } from './health-upload-utils';

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
        <NativeText variant="caption">
          Report available; imaging viewer not available in current sandbox.
        </NativeText>
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
  onNavigate,
}: {
  item: HealthTimelineItem;
  onNavigate: (destination: MobileHealthDestination) => void;
}) {
  const source = formatSourceModule(item.source_module);
  const typeLabel = formatArtifactType(item.artifact_type);
  const destination = resolveTimelineDestination(item);
  return (
    <NativeCard>
      <NativeText>{item.title}</NativeText>
      <NativeText variant="caption">
        {`${formatWhen(item.occurred_at)} · ${typeLabel}${source ? ` · ${source}` : ''} · ${item.status}${item.sandbox ? ' · Sandbox' : ''}`}
      </NativeText>
      {item.summary ? <NativeText variant="caption">{item.summary}</NativeText> : null}
      {destination ? (
        <NativeButton
          label="View record"
          variant="secondary"
          onPress={() => onNavigate(destination)}
        />
      ) : (
        <NativeText variant="caption">Record details are not available for this event.</NativeText>
      )}
    </NativeCard>
  );
}

function OverviewCard({
  title,
  rows,
  empty,
  onOpen,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  empty: string;
  onOpen?: () => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <NativeText variant="h2">{title}</NativeText>
      {!rows.length ? <NativeEmptyState title={empty} description="New activity will appear here when available." /> : null}
      {rows.slice(0, 3).map((row) => (
        <NativeCard key={String(row.id ?? title)}>
          <NativeText>{recordLabel(row, title.slice(0, -1))}</NativeText>
          <NativeText variant="caption">{recordWhen(row)}</NativeText>
        </NativeCard>
      ))}
      {onOpen ? <NativeButton label={`View all ${title.toLowerCase()}`} variant="secondary" onPress={onOpen} /> : null}
    </View>
  );
}

export function HealthHomeScreen({
  ctx,
  onOpenConsent,
  onOpenCareNavigation,
  onOpenArtifact,
  onNavigate,
  onOpenAppointments,
  onOpenPrescriptions,
  onOpenLabBookings,
  onOpenImagingBookings,
  onOpenOrders,
  onOpenReminders,
  onOpenCarePlan,
  onOpenProfile,
}: {
  ctx: FeatureCtx;
  onOpenConsent: () => void;
  onOpenCareNavigation: () => void;
  onOpenArtifact: (artifactId: string) => void;
  onNavigate: (destination: MobileHealthDestination) => void;
  onOpenAppointments: () => void;
  onOpenPrescriptions: () => void;
  onOpenLabBookings: () => void;
  onOpenImagingBookings: () => void;
  onOpenOrders: () => void;
  onOpenReminders?: () => void;
  onOpenCarePlan?: () => void;
  onOpenProfile?: () => void;
}) {
  const [dashboard, setDashboard] = useState<HealthDashboardResponse | null>(null);
  const [dashboardError, setDashboardError] = useState<HealthViewError | null>(null);
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
  const [subjects, setSubjects] = useState<HealthSubjectOption[]>([]);
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState<string | null>(null);

  const loadInitial = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        ctx.setViewState('loading');
      }
      setPageError(null);
      setDashboardError(null);
      setDisabledPack(false);
      setMoreError(null);

      const [dashboardResult, timelineResult, subjectsResult] = await Promise.all([
        fetchHealthDashboard({
          token: ctx.token,
          onUnauthorized: ctx.onUnauthorized,
          countryCode: ctx.country,
          familyMemberId: selectedFamilyMemberId,
        }),
        fetchHealthTimeline({
          token: ctx.token,
          onUnauthorized: ctx.onUnauthorized,
          countryCode: ctx.country,
          familyMemberId: selectedFamilyMemberId,
        }),
        fetchHealthProfileSubjects({
          token: ctx.token,
          onUnauthorized: ctx.onUnauthorized,
          countryCode: ctx.country,
        }),
      ]);

      if (dashboardResult.ok) {
        setDashboard(dashboardResult.data);
        setDashboardError(null);
      } else {
        setDashboard(null);
        setDashboardError(classifyHealthApiFailure(dashboardResult));
      }

      if (timelineResult.ok) {
        setItems(timelineResult.data.items ?? []);
        setNextCursor(timelineResult.data.next_cursor);
        setPageError(null);
        ctx.setViewState('idle');
      } else {
        const failure = classifyHealthApiFailure(timelineResult);
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
      if (subjectsResult.ok) {
        setSubjects(subjectsResult.data.subjects ?? []);
      }
      setRefreshing(false);
    },
    [ctx, selectedFamilyMemberId],
  );

  const handleDestination = useCallback(
    (destination: MobileHealthDestination) => {
      if (!destination) {
        return;
      }
      if (destination.screen === 'health-artifact-detail') {
        onOpenArtifact(destination.artifactId);
        return;
      }
      onNavigate(destination);
    },
    [onNavigate, onOpenArtifact],
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
      countryCode: ctx.country,
      cursor: nextCursor,
      familyMemberId: selectedFamilyMemberId,
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
        countryCode: ctx.country,
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
  }, [loadInitial, selectedFamilyMemberId]);

  return (
    <View style={{ gap: 12 }}>
      <NativePageHeader title="Records" subtitle="Reports, consults, and files for your family." />
      {subjects.length > 1 ? (
        <View style={{ gap: 8 }}>
          <NativeText variant="caption">Viewing health for</NativeText>
          {subjects.map((subject) => (
            <NativeButton
              key={subject.family_member_id ?? 'self'}
              label={subject.display_name}
              variant={
                (subject.family_member_id ?? null) === selectedFamilyMemberId ? 'primary' : 'secondary'
              }
              onPress={() => setSelectedFamilyMemberId(subject.family_member_id)}
            />
          ))}
        </View>
      ) : null}
      <NativeText variant="caption">
        Your unified care overview. Video consults and e-prescriptions are sandbox-limited where labeled. Imaging report retrieval is supported; PACS/DICOM viewing is not available.
      </NativeText>
      <NativeButton label="Manage consent" variant="secondary" onPress={onOpenConsent} />
      <NativeButton label="Care navigation" variant="secondary" onPress={onOpenCareNavigation} />
      {onOpenProfile ? (
        <NativeButton label="Health profile" variant="secondary" onPress={onOpenProfile} />
      ) : null}
      <NativeButton
        label={refreshing ? 'Refreshing…' : 'Refresh'}
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

      {ctx.viewState === 'idle' && dashboard && !dashboardError ? (
        <>
          {dashboard.overview.pending_actions.length ? (
            <View style={{ gap: 8 }}>
              <NativeText variant="h2">Pending actions</NativeText>
              {dashboard.overview.pending_actions.map((action) => {
                const destination = resolvePendingActionDestination(action);
                return (
                  <NativeCard key={`${action.kind}-${action.id}`}>
                    <NativeText>{action.title}</NativeText>
                    <NativeText variant="caption">{`${formatWhen(action.occurred_at)} · ${action.status}`}</NativeText>
                    {destination ? (
                      <NativeButton label="Open" variant="secondary" onPress={() => handleDestination(destination)} />
                    ) : null}
                  </NativeCard>
                );
              })}
            </View>
          ) : null}
          {(dashboard.overview.health_insights?.length ?? 0) > 0 ? (
            <View style={{ gap: 8 }}>
              <NativeText variant="h2">Health insights</NativeText>
              <NativeText variant="caption">Informational summaries — not medical advice.</NativeText>
              {dashboard.overview.health_insights.map((insight) => (
                <NativeCard key={insight.code}>
                  <NativeText>{insight.title}</NativeText>
                  <NativeText variant="caption">{insight.detail}</NativeText>
                  {insight.href && insight.code === 'medication_reminders' && onOpenReminders ? (
                    <NativeButton label="Open reminders" variant="secondary" onPress={onOpenReminders} />
                  ) : null}
                  {insight.href && insight.code === 'care_plan_active' && onOpenCarePlan ? (
                    <NativeButton label="Open care plan" variant="secondary" onPress={onOpenCarePlan} />
                  ) : null}
                </NativeCard>
              ))}
            </View>
          ) : null}
          {dashboard.overview.active_care_plan ? (
            <NativeCard>
              <NativeText variant="h2">Active care plan</NativeText>
              <NativeText>{dashboard.overview.active_care_plan.name}</NativeText>
              {onOpenCarePlan ? (
                <NativeButton label="View care plan" variant="secondary" onPress={onOpenCarePlan} />
              ) : null}
            </NativeCard>
          ) : null}
          {(dashboard.overview.medication_reminders?.length ?? 0) > 0 ? (
            <OverviewCard
              title="Medication reminders"
              rows={dashboard.overview.medication_reminders}
              empty="No medication reminders"
              onOpen={onOpenReminders}
            />
          ) : null}
          <OverviewCard
            title="Upcoming appointments"
            rows={dashboard.overview.upcoming_appointments}
            empty="No upcoming appointments"
            onOpen={onOpenAppointments}
          />
          <OverviewCard
            title="Recent prescriptions"
            rows={dashboard.overview.recent_prescriptions}
            empty="No prescriptions yet"
            onOpen={onOpenPrescriptions}
          />
          <OverviewCard
            title="Recent lab bookings"
            rows={dashboard.overview.recent_lab_bookings}
            empty="No lab bookings yet"
            onOpen={onOpenLabBookings}
          />
          <OverviewCard
            title="Recent imaging bookings"
            rows={dashboard.overview.recent_imaging_bookings}
            empty="No imaging bookings yet"
            onOpen={onOpenImagingBookings}
          />
          <OverviewCard
            title="Recent medicine orders"
            rows={dashboard.overview.recent_orders}
            empty="No medicine orders yet"
            onOpen={onOpenOrders}
          />
        </>
      ) : null}

      <NativeText variant="h2">Recent activity</NativeText>

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
                  <TimelineRow item={item} onNavigate={handleDestination} />
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
      countryCode: ctx.country,
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
      countryCode: ctx.country,
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

export function HealthProfileScreen({
  ctx,
  onBack,
}: {
  ctx: FeatureCtx;
  onBack: () => void;
}) {
  const [subjects, setSubjects] = useState<HealthSubjectOption[]>([]);
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState<string | null>(null);
  const [profile, setProfile] = useState<HealthProfileResponse | null>(null);
  const [pageError, setPageError] = useState<HealthViewError | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [allergen, setAllergen] = useState('');
  const [condition, setCondition] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  const load = useCallback(async () => {
    ctx.setViewState('loading');
    setPageError(null);
    const tokenOpts = {
      token: ctx.token,
      onUnauthorized: ctx.onUnauthorized,
      countryCode: ctx.country,
      familyMemberId: selectedFamilyMemberId,
    };
    const [subjectsResult, profileResult] = await Promise.all([
      fetchHealthProfileSubjects(tokenOpts),
      fetchHealthProfile(tokenOpts),
    ]);
    if (subjectsResult.ok) {
      setSubjects(subjectsResult.data.subjects ?? []);
    }
    if (profileResult.ok) {
      setProfile(profileResult.data);
      setFormError(null);
      ctx.setViewState('idle');
    } else {
      setProfile(null);
      const failure = classifyHealthApiFailure(profileResult);
      setPageError(failure);
      if (failure === 'forbidden') {
        ctx.setViewState('forbidden');
      } else if (failure === 'unauthorized') {
        ctx.onUnauthorized();
      } else if (failure === 'network') {
        ctx.setViewState('network');
      } else {
        ctx.setViewState('idle');
      }
    }
  }, [ctx, selectedFamilyMemberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runMutation = async (fn: () => Promise<{ ok: boolean }>) => {
    setBusy(true);
    setFormError(null);
    const result = await fn();
    if (!result.ok) {
      setFormError('Save failed. Please try again.');
      setBusy(false);
      return;
    }
    await load();
    setBusy(false);
  };

  return (
    <View style={{ gap: 12 }}>
      <NativeButton label="← Back" variant="secondary" onPress={onBack} />
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: '#1A365D',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <NativeText variant="h2" style={{ color: '#fff' }}>
            {(
              subjects.find((s) => (s.family_member_id ?? null) === selectedFamilyMemberId)?.display_name?.[0] ??
              'H'
            ).toUpperCase()}
          </NativeText>
        </View>
        <NativeText variant="h2">
          {subjects.find((s) => (s.family_member_id ?? null) === selectedFamilyMemberId)?.display_name ??
            'Health profile'}
        </NativeText>
        <NativeText variant="caption">
          User-managed health information. Not a clinical diagnosis.
        </NativeText>
      </View>

      {subjects.length > 1 ? (
        <View style={{ gap: 8 }}>
          <NativeText variant="caption">Profile for</NativeText>
          {subjects.map((subject) => (
            <NativeButton
              key={subject.family_member_id ?? 'self'}
              label={subject.display_name}
              variant={
                (subject.family_member_id ?? null) === selectedFamilyMemberId ? 'primary' : 'secondary'
              }
              onPress={() => setSelectedFamilyMemberId(subject.family_member_id)}
            />
          ))}
        </View>
      ) : null}

      <FeatureStates viewState={ctx.viewState} onRetry={() => void load()} />

      {ctx.viewState === 'idle' && pageError === 'forbidden' ? <NativePermissionDeniedState /> : null}
      {ctx.viewState === 'idle' && pageError === 'network' ? (
        <NativeNetworkErrorState onRetry={() => void load()} />
      ) : null}

      {ctx.viewState === 'idle' && profile ? (
        <>
          <NativeCard>
            <NativeText variant="caption">{`Last updated ${profile.profile.updated_at}`}</NativeText>
          </NativeCard>

          <NativeText variant="h2">Allergies</NativeText>
          {profile.profile.allergies.length === 0 ? (
            <NativeEmptyState title="No allergies recorded" description="Add allergies care teams should know." />
          ) : (
            profile.profile.allergies.map((row) => (
              <NativeCard key={row.id}>
                <NativeText>{row.allergen}</NativeText>
                <NativeText variant="caption">
                  {[row.severity, row.reaction, row.active ? 'Active' : 'Inactive'].filter(Boolean).join(' · ')}
                </NativeText>
              </NativeCard>
            ))
          )}
          <NativeInput label="Add allergy" value={allergen} onChangeText={setAllergen} />
          <NativeButton
            label="Add allergy"
            disabled={busy || !allergen.trim()}
            onPress={() =>
              void runMutation(async () =>
                addHealthAllergy({
                  token: ctx.token,
                  onUnauthorized: ctx.onUnauthorized,
                  countryCode: ctx.country,
                  familyMemberId: selectedFamilyMemberId,
                  allergen: allergen.trim(),
                  severity: 'MODERATE',
                }),
              )
            }
          />

          <NativeText variant="h2">Chronic conditions</NativeText>
          {profile.profile.conditions.length === 0 ? (
            <NativeEmptyState title="No conditions recorded" description="Track ongoing conditions here." />
          ) : (
            profile.profile.conditions.map((row) => (
              <NativeCard key={row.id}>
                <NativeText>{row.condition}</NativeText>
                <NativeText variant="caption">{row.status}</NativeText>
              </NativeCard>
            ))
          )}
          <NativeInput label="Add condition" value={condition} onChangeText={setCondition} />
          <NativeButton
            label="Add condition"
            disabled={busy || !condition.trim()}
            onPress={() =>
              void runMutation(async () =>
                addHealthCondition({
                  token: ctx.token,
                  onUnauthorized: ctx.onUnauthorized,
                  countryCode: ctx.country,
                  familyMemberId: selectedFamilyMemberId,
                  condition: condition.trim(),
                }),
              )
            }
          />

          <NativeText variant="h2">Vitals</NativeText>
          {profile.profile.vitals.length === 0 ? (
            <NativeEmptyState title="No vitals recorded" description="Record weight, blood pressure, or pulse." />
          ) : (
            profile.profile.vitals.slice(0, 5).map((row) => (
              <NativeCard key={row.id}>
                <NativeText variant="caption">
                  {[
                    row.weight_kg != null ? `${row.weight_kg} kg` : null,
                    row.blood_pressure_systolic != null
                      ? `BP ${row.blood_pressure_systolic}/${row.blood_pressure_diastolic ?? '—'}`
                      : null,
                    row.pulse_bpm != null ? `${row.pulse_bpm} bpm` : null,
                    row.recorded_at,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </NativeText>
              </NativeCard>
            ))
          )}
          <NativeInput label="Weight (kg)" value={weightKg} onChangeText={setWeightKg} />
          <NativeButton
            label="Record vital"
            disabled={busy || !weightKg.trim()}
            onPress={() =>
              void runMutation(async () =>
                addHealthVital({
                  token: ctx.token,
                  onUnauthorized: ctx.onUnauthorized,
                  countryCode: ctx.country,
                  familyMemberId: selectedFamilyMemberId,
                  weight_kg: Number(weightKg),
                }),
              )
            }
          />

          <NativeText variant="h2">Emergency contact</NativeText>
          {profile.profile.emergency_contact ? (
            <NativeCard>
              <NativeText>{profile.profile.emergency_contact.name}</NativeText>
              <NativeText variant="caption">
                {`${profile.profile.emergency_contact.relationship} · ${profile.profile.emergency_contact.phone}`}
              </NativeText>
            </NativeCard>
          ) : (
            <NativeEmptyState title="No emergency contact" description="Add someone we can reach in an emergency." />
          )}
          <NativeInput label="Name" value={emergencyName} onChangeText={setEmergencyName} />
          <NativeInput label="Relationship" value={emergencyRelationship} onChangeText={setEmergencyRelationship} />
          <NativeInput label="Phone" value={emergencyPhone} onChangeText={setEmergencyPhone} />
          <NativeButton
            label="Save emergency contact"
            disabled={
              busy || !emergencyName.trim() || !emergencyRelationship.trim() || !emergencyPhone.trim()
            }
            onPress={() =>
              void runMutation(async () =>
                upsertHealthEmergencyContact({
                  token: ctx.token,
                  onUnauthorized: ctx.onUnauthorized,
                  countryCode: ctx.country,
                  familyMemberId: selectedFamilyMemberId,
                  name: emergencyName.trim(),
                  relationship: emergencyRelationship.trim(),
                  phone: emergencyPhone.trim(),
                }),
              )
            }
          />

          {formError ? <NativeText variant="caption">{formError}</NativeText> : null}
        </>
      ) : null}
    </View>
  );
}

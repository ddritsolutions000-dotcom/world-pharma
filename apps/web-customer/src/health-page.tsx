'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  FormField,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  fetchHealthDashboard,
  fetchHealthTimeline,
  uploadHealthDocument,
  type HealthDashboardResponse,
  type HealthTimelineItem,
} from './health-api';
import {
  fetchHealthProfileSubjects,
  type HealthSubjectOption,
} from './health-profile-api';
import {
  classifyHealthApiFailure,
  formatArtifactType,
  formatSourceModule,
  formatWhen,
  groupTimelineByDate,
  resolvePendingActionHref,
  resolveTimelineHref,
  type HealthViewError,
} from './health-utils';
import { useSelectedCountry } from './use-selected-country';
import { AccountHubNav } from './ui/account-hub-nav';
import { MgBtn, MgCard, Page, PageIntro, Section, ServiceHero } from './ui/mg-ui';

const QUICK_ACTIONS = [
  { href: '/doctors', label: 'Book doctor' },
  { href: '/lab', label: 'Book lab test' },
  { href: '/radiology', label: 'Book imaging' },
  { href: '/', label: 'Order medicines' },
  { href: '/prescriptions', label: 'Prescriptions' },
  { href: '/lab/bookings', label: 'Lab reports' },
  { href: '/radiology/bookings', label: 'Imaging reports' },
  { href: '/appointments', label: 'Appointments' },
  { href: '/health/profile', label: 'Health profile' },
  { href: '/reminders', label: 'Medicine reminders' },
  { href: '/care-plan', label: 'Care plan' },
  { href: '/family', label: 'Family members' },
] as const;

const CARE_SUMMARY_LINKS = [
  { href: '/prescriptions', label: 'Prescriptions', description: 'Issued prescriptions and refill options' },
  { href: '/appointments', label: 'Consultations', description: 'Upcoming and past doctor visits' },
  { href: '/lab/bookings', label: 'Lab reports', description: 'Diagnostic bookings and published results' },
  { href: '/radiology/bookings', label: 'Imaging reports', description: 'Radiology bookings and report retrieval (no PACS viewer)' },
  { href: '/orders', label: 'Medicine orders', description: 'Pharmacy orders linked to your care' },
] as const;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function OverviewStat({ label, count }: { label: string; count: number }) {
  return (
    <MgCard>
      <h3 className="mg-list-title">{count}</h3>
      <p className="mg-list-meta">{label}</p>
    </MgCard>
  );
}

function TimelineEventCard({ item }: { item: HealthTimelineItem }) {
  const source = formatSourceModule(item.source_module);
  const typeLabel = formatArtifactType(item.artifact_type);
  const href = resolveTimelineHref(item);
  const body = (
    <MgCard>
      <h3 className="mg-list-title">{item.title}</h3>
      <p className="mg-list-meta">
        {formatWhen(item.occurred_at)} · {typeLabel}
        {source ? ` · ${source}` : ''} · {item.status}
        {item.sandbox ? ' · Sandbox' : ''}
      </p>
      {item.summary ? <p className="mg-list-meta">{item.summary}</p> : null}
      {!href ? (
        <p className="mg-list-meta">Record details are not available for this event.</p>
      ) : null}
    </MgCard>
  );

  if (!href) {
    return body;
  }

  return (
    <Link href={href} aria-label={`View ${item.title}`}>
      {body}
    </Link>
  );
}

function recordLabel(row: Record<string, unknown>, fallback: string): string {
  if (typeof row.title === 'string' && row.title.trim()) {
    return row.title;
  }
  if (typeof row.doctor_display_name === 'string' && row.doctor_display_name.trim()) {
    return row.doctor_display_name;
  }
  if (typeof row.lab_display_name === 'string' && row.lab_display_name.trim()) {
    return row.lab_display_name;
  }
  if (typeof row.imaging_display_name === 'string' && row.imaging_display_name.trim()) {
    return row.imaging_display_name;
  }
  if (typeof row.order_number === 'string' && row.order_number.trim()) {
    return `Order ${row.order_number}`;
  }
  if (typeof row.status === 'string' && row.status.trim()) {
    return `${fallback} · ${row.status}`;
  }
  return fallback;
}

function recordWhen(row: Record<string, unknown>): string {
  const candidates = ['starts_at', 'created_at', 'issued_at', 'updated_at', 'occurred_at'];
  for (const key of candidates) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) {
      return formatWhen(value);
    }
  }
  return '—';
}

function OverviewList({
  title,
  rows,
  empty,
  buildHref,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  empty: string;
  buildHref: (row: Record<string, unknown>) => string | null;
}) {
  return (
    <Section title={title}>
      {rows.length === 0 ? (
        <EmptyState title={empty} description="New activity will appear here when available." />
      ) : (
        <div className="mg-order-list">
          {rows.map((row) => {
            const id = String(row.id ?? '');
            const href = buildHref(row);
            const card = (
              <MgCard>
                <h3 className="mg-list-title">{recordLabel(row, title.slice(0, -1))}</h3>
                <p className="mg-list-meta">{recordWhen(row)}</p>
              </MgCard>
            );
            if (!href || !id) {
              return <div key={id || title}>{card}</div>;
            }
            return (
              <Link key={id} href={href} aria-label={`Open ${recordLabel(row, title)}`}>
                {card}
              </Link>
            );
          })}
        </div>
      )}
    </Section>
  );
}

export function HealthScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { country: countryCode, countryName } = useSelectedCountry();
  const [dashboard, setDashboard] = useState<HealthDashboardResponse | null>(null);
  const [items, setItems] = useState<HealthTimelineItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<HealthViewError | null>(null);
  const [dashboardError, setDashboardError] = useState<HealthViewError | null>(null);
  const [moreError, setMoreError] = useState<HealthViewError | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<HealthSubjectOption[]>([]);
  const [selectedFamilyMemberId, setSelectedFamilyMemberId] = useState<string | null>(null);

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
      setDashboardError(null);
      setMoreError(null);

      const [dashboardResult, timelineResult, subjectsResult] = await Promise.all([
        fetchHealthDashboard({
          token,
          onUnauthorized,
          countryCode,
          familyMemberId: selectedFamilyMemberId,
        }),
        fetchHealthTimeline({
          token,
          onUnauthorized,
          countryCode,
          familyMemberId: selectedFamilyMemberId,
        }),
        fetchHealthProfileSubjects({ token, onUnauthorized, countryCode }),
      ]);

      if (dashboardResult.ok) {
        setDashboard(dashboardResult.data);
        setDashboardError(null);
      } else {
        setDashboard(null);
        setDashboardError(classifyHealthApiFailure(dashboardResult));
      }

      if (timelineResult.ok) {
        applyTimelinePage(timelineResult.data.items ?? [], timelineResult.data.next_cursor, false);
        setError(null);
      } else {
        applyTimelinePage([], null, false);
        setError(classifyHealthApiFailure(timelineResult));
      }

      if (subjectsResult.ok) {
        setSubjects(subjectsResult.data.subjects ?? []);
      }

      setLoading(false);
      setRefreshing(false);
    },
    [applyTimelinePage, countryCode, getAccessToken, onUnauthorized, selectedFamilyMemberId, session.status],
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
      familyMemberId: selectedFamilyMemberId,
    });

    if (result.ok) {
      applyTimelinePage(result.data.items ?? [], result.data.next_cursor, true);
    } else {
      setMoreError(classifyHealthApiFailure(result));
    }
    setLoadingMore(false);
  }, [applyTimelinePage, countryCode, getAccessToken, nextCursor, onUnauthorized, selectedFamilyMemberId]);

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
  }, [countryCode, session.status, loadInitial, selectedFamilyMemberId]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return (
      <Page>
        <ServiceHero
          kicker="Your care file"
          title="Health dashboard"
          subtitle="Your unified healthcare journey."
        />
        <PageIntro>
          <p>Sign in with OTP to view appointments, prescriptions, lab and imaging reports, medicine orders, and your health timeline.</p>
        </PageIntro>
        <EmptyState
          title="Sign in required"
          description="Sign in with OTP to view your health dashboard."
          action={{ label: 'Sign in', onClick: () => (window.location.href = '/login') }}
        />
      </Page>
    );
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  const overview = dashboard?.overview;
  const timelineItems = dashboard?.timeline_enabled ? items : (dashboard?.recent_activity.items ?? []);

  return (
    <Page>
      <AccountHubNav />
      <ServiceHero
        kicker="Your care file"
        title="Health dashboard"
        subtitle="Appointments, prescriptions, diagnostics, imaging, orders, and your care timeline in one place."
      />
      <PageIntro>
        <p>
          {`Market: ${countryName} (${countryCode}).`} Video consults and e-prescriptions are sandbox-limited where labeled. Imaging report PDF retrieval is supported; PACS/DICOM viewing is not available.
        </p>
      </PageIntro>

      {subjects.length > 1 ? (
        <Section title="Viewing health for">
          <div className="mg-toolbar">
            {subjects.map((subject) => {
              const active =
                (subject.family_member_id ?? null) === (selectedFamilyMemberId ?? null);
              return (
                <MgBtn
                  key={subject.family_member_id ?? 'self'}
                  variant={active ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setSelectedFamilyMemberId(subject.family_member_id)}
                >
                  {subject.display_name}
                </MgBtn>
              );
            })}
          </div>
          {dashboard?.viewing_subject ? (
            <Text size="caption">
              {`Showing records for ${dashboard.viewing_subject.display_name}. Health data is managed by you as the account owner.`}
            </Text>
          ) : null}
        </Section>
      ) : null}

      <div className="mg-toolbar">
        {QUICK_ACTIONS.map((action) => (
          <MgBtn key={action.href} href={action.href} variant="secondary" size="sm">
            {action.label}
          </MgBtn>
        ))}
        <MgBtn href="/account/consent" variant="ghost" size="sm">
          Manage consent
        </MgBtn>
        <MgBtn href="/health/care-navigation" variant="ghost" size="sm">
          Care navigation
        </MgBtn>
        <MgBtn variant="secondary" size="sm" disabled={loading || refreshing} onClick={() => void loadInitial('refresh')}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </MgBtn>
      </div>

      {loading ? <LoadingState label="Loading health dashboard" /> : null}

      {!loading && dashboardError === 'unauthorized' ? (
        <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />
      ) : null}
      {!loading && dashboardError === 'forbidden' ? <PermissionDeniedState /> : null}
      {!loading && dashboardError === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadInitial('initial') }} />
      ) : null}

      {!loading && !dashboardError && overview ? (
        <>
          <Section title="Care overview">
            <div className="mg-order-list">
              <OverviewStat label="Upcoming appointments" count={overview.upcoming_appointments.length} />
              <OverviewStat label="Recent prescriptions" count={overview.recent_prescriptions.length} />
              <OverviewStat label="Lab bookings" count={overview.recent_lab_bookings.length} />
              <OverviewStat label="Imaging bookings" count={overview.recent_imaging_bookings.length} />
              <OverviewStat label="Medicine orders" count={overview.recent_orders.length} />
              <OverviewStat label="Pending actions" count={overview.pending_actions.length} />
              <OverviewStat label="Active reminders" count={overview.medication_reminders?.length ?? 0} />
              <OverviewStat
                label="Care plan"
                count={overview.active_care_plan ? 1 : 0}
              />
            </div>
          </Section>

          {(overview.health_insights?.length ?? 0) > 0 ? (
            <Section title="Health insights">
              <p className="mg-list-meta">
                Informational summaries from your records — not medical advice or diagnosis.
              </p>
              <div className="mg-order-list">
                {overview.health_insights.map((insight) => {
                  const card = (
                    <MgCard>
                      <h3 className="mg-list-title">{insight.title}</h3>
                      <p className="mg-list-meta">{insight.detail}</p>
                    </MgCard>
                  );
                  if (!insight.href) {
                    return <div key={insight.code}>{card}</div>;
                  }
                  return (
                    <Link key={insight.code} href={insight.href}>
                      {card}
                    </Link>
                  );
                })}
              </div>
            </Section>
          ) : null}

          {overview.active_care_plan ? (
            <Section title="Active care plan">
              <Link href="/care-plan">
                <MgCard>
                  <h3 className="mg-list-title">{overview.active_care_plan.name}</h3>
                  <p className="mg-list-meta">Sandbox plan · review benefits and included services</p>
                </MgCard>
              </Link>
            </Section>
          ) : null}

          {(overview.medication_reminders?.length ?? 0) > 0 ? (
            <OverviewList
              title="Medication reminders"
              rows={overview.medication_reminders}
              empty="No medication reminders"
              buildHref={() => '/reminders'}
            />
          ) : null}

          {overview.pending_actions.length > 0 ? (
            <Section title="Pending health actions">
              <div className="mg-order-list">
                {overview.pending_actions.map((action) => {
                  const href = resolvePendingActionHref(action);
                  const card = (
                    <MgCard>
                      <h3 className="mg-list-title">{action.title}</h3>
                      <p className="mg-list-meta">
                        {formatWhen(action.occurred_at)} · {action.status}
                      </p>
                    </MgCard>
                  );
                  if (!href) {
                    return <div key={`${action.kind}-${action.id}`}>{card}</div>;
                  }
                  return (
                    <Link key={`${action.kind}-${action.id}`} href={href}>
                      {card}
                    </Link>
                  );
                })}
              </div>
            </Section>
          ) : null}

          <OverviewList
            title="Upcoming appointments"
            rows={overview.upcoming_appointments}
            empty="No upcoming appointments"
            buildHref={(row) => (row.id ? `/appointments/${String(row.id)}` : null)}
          />
          <OverviewList
            title="Recent prescriptions"
            rows={overview.recent_prescriptions}
            empty="No prescriptions yet"
            buildHref={() => '/prescriptions'}
          />
          <OverviewList
            title="Recent lab bookings"
            rows={overview.recent_lab_bookings}
            empty="No lab bookings yet"
            buildHref={(row) => (row.id ? `/lab/bookings/${String(row.id)}` : null)}
          />
          <OverviewList
            title="Recent imaging bookings"
            rows={overview.recent_imaging_bookings}
            empty="No imaging bookings yet"
            buildHref={(row) => (row.id ? `/radiology/bookings/${String(row.id)}` : null)}
          />
          <OverviewList
            title="Recent medicine orders"
            rows={overview.recent_orders}
            empty="No medicine orders yet"
            buildHref={(row) =>
              row.order_number ? `/orders/${String(row.order_number)}` : row.id ? `/orders/${String(row.id)}` : null
            }
          />

          <Section title="Care summary">
            <div className="mg-order-list">
              {CARE_SUMMARY_LINKS.map((link) => (
                <Link key={link.href} href={link.href}>
                  <MgCard>
                    <h3 className="mg-list-title">{link.label}</h3>
                    <p className="mg-list-meta">{link.description}</p>
                  </MgCard>
                </Link>
              ))}
            </div>
          </Section>
        </>
      ) : null}

      <Section title="Upload a document">
        <MgCard className="mg-form-card">
          <FormField label="Upload document (PDF/JPEG/PNG, max 10 MB)">
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
        </MgCard>
      </Section>
      {uploading ? <LoadingState label="Uploading document" /> : null}
      {uploadError ? <Text tone="secondary">{uploadError}</Text> : null}

      <Section title="Recent activity">
        {!dashboard?.timeline_enabled ? (
          <EmptyState
            title="Health timeline unavailable"
            description="The unified timeline is not enabled for this country. Individual records remain available above."
          />
        ) : null}

        {dashboard?.timeline_enabled && !loading && error === 'network' ? (
          <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadInitial('initial') }} />
        ) : null}
        {dashboard?.timeline_enabled && !loading && error === 'generic' ? (
          <EmptyState
            title="Could not load timeline"
            description="An unexpected error occurred while loading your health timeline."
            action={{ label: 'Retry', onClick: () => void loadInitial('initial') }}
          />
        ) : null}

        {dashboard?.timeline_enabled && !loading && !error && timelineItems.length === 0 ? (
          <EmptyState
            title="No health activity yet"
            description="Published lab, imaging, prescription, and consultation events will appear here when available."
          />
        ) : null}

        {dashboard?.timeline_enabled && !loading && !error && timelineItems.length > 0 ? (
          <div className="mg-order-list">
            {groupTimelineByDate(timelineItems).map((group) => (
              <Section key={group.dateKey} title={group.heading}>
                {group.items.map((item) => (
                  <TimelineEventCard key={item.id} item={item} />
                ))}
              </Section>
            ))}
            {nextCursor ? (
              <MgBtn variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? 'Loading more…' : 'Load more'}
              </MgBtn>
            ) : null}
            {moreError === 'network' ? (
              <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadMore() }} />
            ) : null}
          </div>
        ) : null}
      </Section>
    </Page>
  );
}

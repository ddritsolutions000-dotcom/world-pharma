'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PartnerInboxPanel,
  PartnerSupportPanel,
  PortalAuthPage,
  PortalBrandBar,
  PortalKpiCards,
  RouteBreadcrumbs,
  buildPortalBreadcrumbs,
  useSession,
} from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  HeaderBar,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Sidebar,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  RadiologyApiError,
  fetchImagingActivity,
  fetchImagingOffers,
  fetchImagingOrganizations,
  fetchImagingStaffBookings,
  fetchImagingStudies,
  fetchRadiologyMe,
  type ImagingOrganization,
} from './radiology-api';
import { RadiologyCapabilitiesPanel } from './radiology-capabilities-panel';
import { RadiologyCatalogPanel } from './radiology-catalog-panel';
import { ImagingBookingsPanel } from './imaging-bookings-panel';
import { ImagingCheckInPanel } from './imaging-check-in-panel';
import { ImagingStudiesPanel } from './imaging-studies-panel';
import { ImagingInterpretationsPanel } from './imaging-interpretations-panel';
import { ImagingPhysicalReportsPanel } from './imaging-physical-reports-panel';
import { RadiologySchedulePanel } from './radiology-schedule-panel';
import { RadiologySettingsPanel } from './radiology-settings-panel';

type TabId =
  | 'dashboard'
  | 'organization'
  | 'capabilities'
  | 'catalog'
  | 'schedule'
  | 'bookings'
  | 'check-in'
  | 'studies'
  | 'interpretations'
  | 'physical-reports'
  | 'notifications'
  | 'support'
  | 'activity'
  | 'settings';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

const NAV: Array<{ id: TabId; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'organization', label: 'Organization' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'check-in', label: 'Check-in' },
  { id: 'studies', label: 'Studies' },
  { id: 'interpretations', label: 'Interpretation' },
  { id: 'physical-reports', label: 'Physical reports' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'support', label: 'Support' },
  { id: 'activity', label: 'Activity' },
  { id: 'settings', label: 'Settings' },
];

function isTabId(value: string): value is TabId {
  return NAV.some((item) => item.id === value);
}

function OrgPicker({
  organizations,
  organizationId,
  onChange,
  loading,
}: {
  organizations: ImagingOrganization[];
  organizationId: string;
  onChange: (id: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return <LoadingState label="Preparing imaging center organizations…" />;
  }
  if (!organizations.length) {
    return (
      <EmptyState
        title="No imaging center organization"
        description="You need an active membership on an IMAGING_CENTER organization. Apply as an imaging partner, or sign in with the email your center admin invited."
        action={{
          label: 'Apply as imaging partner',
          onClick: () => {
            window.location.href = 'http://127.0.0.1:3008/imaging';
          },
        }}
      />
    );
  }
  return (
    <Card>
      <FormField label="Imaging center organization">
        {({ id }) => (
          <select
            id={id}
            className="wp-input"
            value={organizationId}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Select organization</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.display_name || org.legal_name} ({org.country_code})
              </option>
            ))}
          </select>
        )}
      </FormField>
    </Card>
  );
}

export function RadiologyShell() {
  const { session, signOut, expire, getAccessToken } = useSession();
  const [organizations, setOrganizations] = useState<ImagingOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [scopeLoading, setScopeLoading] = useState(false);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [offerCount, setOfferCount] = useState(0);
  const [bookingCount, setBookingCount] = useState(0);
  const [studyCount, setStudyCount] = useState(0);
  const [activityRows, setActivityRows] = useState<
    Array<{ id: string; type: string; outcome: string; created_at: string }>
  >([]);
  const [actorPersonId, setActorPersonId] = useState<string | null>(null);

  const selectedOrg = useMemo(
    () => organizations.find((org) => org.id === organizationId) ?? null,
    [organizationId, organizations],
  );

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof RadiologyApiError) {
        if (err.status === 403) {
          setViewState('forbidden');
          return;
        }
        if (err.status === 401) {
          expire();
          return;
        }
        setViewState('error');
        setErrorMessage(err.message);
        return;
      }
      setViewState('network');
    },
    [expire],
  );

  const selectTab = useCallback((next: TabId) => {
    setTab(next);
    if (typeof window !== 'undefined') {
      window.location.hash = next;
    }
  }, []);

  useEffect(() => {
    const syncHash = () => {
      const raw = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
      if (raw && isTabId(raw)) {
        setTab(raw);
      }
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  const loadScope = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setScopeLoading(true);
    try {
      const [orgRes, meRes] = await Promise.all([
        fetchImagingOrganizations(token),
        fetchRadiologyMe(token),
      ]);
      setOrganizations(orgRes.data);
      setActorPersonId(meRes.person_id);
      if (orgRes.data.length >= 1) {
        setOrganizationId((current) => {
          if (current && orgRes.data.some((org) => org.id === current)) {
            return current;
          }
          const preferred =
            orgRes.data.find((org) => org.country_code === 'IN') ??
            orgRes.data.find((org) => org.country_code === 'XX') ??
            orgRes.data[0];
          return preferred!.id;
        });
      }
      setViewState('idle');
      setErrorMessage(null);
    } catch (err) {
      handleApiError(err);
    } finally {
      setScopeLoading(false);
    }
  }, [getAccessToken, handleApiError]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void loadScope();
    }
  }, [loadScope, session.status]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !organizationId || session.status !== 'authenticated') {
      return;
    }
    void Promise.all([
      fetchImagingOffers(token, organizationId).then((body) => setOfferCount(body.data.length)).catch(() => setOfferCount(0)),
      fetchImagingStaffBookings(token, organizationId)
        .then((body) => setBookingCount(body.data.length))
        .catch(() => setBookingCount(0)),
      fetchImagingStudies(token, organizationId)
        .then((body) => setStudyCount(body.data.length))
        .catch(() => setStudyCount(0)),
    ]);
  }, [getAccessToken, organizationId, session.status, tab]);

  if (session.status === 'expired') {
    return (
      <div className="portal-root radiology-body" data-tone="radiology">
        <div className="shell-main">
          <SessionExpiredState action={{ label: 'Continue', onClick: () => selectTab('dashboard') }} />
        </div>
      </div>
    );
  }

  if (session.status !== 'authenticated') {
    return <PortalAuthPage portalId="radiology" />;
  }

  const token = getAccessToken() ?? '';

  return (
    <div className="portal-root radiology-body" data-tone="radiology">
      <PortalBrandBar portalLabel="Imaging" />
      <HeaderBar title="Imaging center operations">
        <Text size="caption">
          {selectedOrg
            ? `${selectedOrg.display_name} · ${selectedOrg.country_code} · sandbox`
            : 'Select an IMAGING_CENTER organization'}
        </Text>
        <Button size="sm" variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </HeaderBar>
      <div className="portal-body">
        <aside className="portal-sidebar">
          <Sidebar
            items={NAV.map((item) => ({ id: item.id, label: item.label }))}
            current={tab}
            onSelect={(id) => {
              if (isTabId(id)) {
                selectTab(id);
              }
            }}
          />
        </aside>
        <main className="portal-main wp-stack">
          <RouteBreadcrumbs
            items={buildPortalBreadcrumbs(
              'Radiology',
              tab,
              Object.fromEntries(NAV.map((item) => [item.id, item.label])),
            )}
          />
          <header className="wp-page-header">
            <Heading level={1}>Imaging center</Heading>
            <p className="wp-page-intro">
              Scheduling, check-in, studies, interpretations, and report delivery for your imaging organization.
            </p>
          </header>
          <p className="wp-sandbox-banner" role="status">
            Sandbox imaging — PACS/DICOM viewers are EXTERNAL_GATED. This console is not a live radiology network.
          </p>

          <OrgPicker
            organizations={organizations}
            organizationId={organizationId}
            onChange={setOrganizationId}
            loading={scopeLoading}
          />

          {viewState === 'forbidden' ? <PermissionDeniedState /> : null}
          {viewState === 'network' ? (
            <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadScope() }} />
          ) : null}
          {viewState === 'error' ? (
            <Card>
              <Text tone="secondary">{errorMessage ?? 'Request failed'}</Text>
              <Button size="sm" variant="secondary" onClick={() => setViewState('idle')}>
                Dismiss
              </Button>
            </Card>
          ) : null}

          {viewState === 'idle' || viewState === 'loading' ? (
            <>
              {tab === 'dashboard' ? (
                <Card>
                  <Heading level={2}>Imaging snapshot</Heading>
                  <Text tone="secondary">
                    Queue for {selectedOrg?.display_name ?? 'your imaging center'}. Reports use sandbox metadata only.
                  </Text>
                  <PortalKpiCards
                    items={[
                      { label: 'Catalog offers', value: offerCount },
                      { label: 'Bookings', value: bookingCount },
                      { label: 'Studies', value: studyCount },
                    ]}
                  />
                  <div className="wp-quick-grid" style={{ marginTop: 16 }}>
                    <Button onClick={() => selectTab('bookings')}>Open bookings</Button>
                    <Button variant="secondary" onClick={() => selectTab('check-in')}>
                      Check-in
                    </Button>
                    <Button variant="secondary" onClick={() => selectTab('studies')}>
                      Studies
                    </Button>
                    <Button variant="secondary" onClick={() => selectTab('interpretations')}>
                      Interpretations
                    </Button>
                  </div>
                </Card>
              ) : null}
              {tab === 'organization' ? (
                <Card>
                  <Heading level={2}>Organization</Heading>
                  {selectedOrg ? (
                    <>
                      <Text>
                        {selectedOrg.legal_name} ({selectedOrg.kind}) · status {selectedOrg.status}
                      </Text>
                      <Text size="caption">
                        Role {selectedOrg.role_name} ({selectedOrg.role_code}) · country{' '}
                        {selectedOrg.country_code}
                        {selectedOrg.location_id
                          ? ` · membership location ${selectedOrg.location_id}`
                          : ''}
                      </Text>
                    </>
                  ) : (
                    <EmptyState
                      title="No organization selected"
                      description="Choose an IMAGING_CENTER organization to view membership context."
                    />
                  )}
                </Card>
              ) : null}
              {tab === 'capabilities' && organizationId ? (
                <RadiologyCapabilitiesPanel
                  organizationId={organizationId}
                  token={token}
                  onError={handleApiError}
                />
              ) : null}
              {tab === 'catalog' && organizationId && selectedOrg ? (
                <RadiologyCatalogPanel
                  organizationId={organizationId}
                  countryCode={selectedOrg.country_code}
                  token={token}
                  onError={handleApiError}
                />
              ) : null}
              {tab === 'schedule' && organizationId ? (
                <RadiologySchedulePanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {tab === 'bookings' && organizationId ? (
                <ImagingBookingsPanel
                  organizationId={organizationId}
                  token={token}
                  onError={handleApiError}
                />
              ) : null}
              {tab === 'check-in' && organizationId && actorPersonId ? (
                <ImagingCheckInPanel
                  organizationId={organizationId}
                  token={token}
                  technicianPersonId={actorPersonId}
                  onError={handleApiError}
                  onCheckedIn={() => selectTab('studies')}
                />
              ) : null}
              {tab === 'studies' && organizationId ? (
                <ImagingStudiesPanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {tab === 'interpretations' && organizationId ? (
                <ImagingInterpretationsPanel
                  organizationId={organizationId}
                  token={token}
                  onError={handleApiError}
                />
              ) : null}
              {tab === 'physical-reports' && organizationId ? (
                <ImagingPhysicalReportsPanel
                  organizationId={organizationId}
                  token={token}
                  onError={handleApiError}
                />
              ) : null}
              {tab === 'settings' ? (
                <RadiologySettingsPanel organization={selectedOrg} actorPersonId={actorPersonId} />
              ) : null}
              {tab === 'notifications' ? <PartnerInboxPanel token={token} audienceLabel="imaging operators" /> : null}
              {tab === 'support' ? <PartnerSupportPanel token={token} audienceLabel="imaging operators" /> : null}
              {tab === 'activity' && organizationId ? (
                <Card>
                  <Heading level={2}>Activity</Heading>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void fetchImagingActivity(token, organizationId)
                        .then((body) => setActivityRows(body.data))
                        .catch(handleApiError);
                    }}
                  >
                    Refresh activity
                  </Button>
                  {!activityRows.length ? (
                    <EmptyState
                      title="No recent activity"
                      description="Attestation and governance events appear here without clinical payloads."
                    />
                  ) : (
                    <ul>
                      {activityRows.map((row) => (
                        <li key={row.id}>
                          <Text size="caption">
                            {row.created_at} · {row.type} · {row.outcome}
                          </Text>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ) : null}
              {(tab === 'capabilities' || tab === 'catalog' || tab === 'activity') && !organizationId ? (
                <EmptyState
                  title="Select an imaging center"
                  description="Choose an IMAGING_CENTER organization to continue."
                />
              ) : null}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

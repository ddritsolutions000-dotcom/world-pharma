'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
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
        description="You need an active membership on an IMAGING_CENTER organization. Lab, vendor, and clinic memberships are not shown here."
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
                {org.display_name || org.legal_name} ({org.role_code})
              </option>
            ))}
          </select>
        )}
      </FormField>
    </Card>
  );
}

function LaterPhaseState({ title, phase }: { title: string; phase: string }) {
  return (
    <Card>
      <EmptyState
        title={title}
        description={`${phase} is planned after R8-A. This navigation slot is reserved without fake booking, acquisition, or clinical data.`}
      />
    </Card>
  );
}

export function RadiologyShell() {
  const { session, signInWithOtp, signOut, expire, getAccessToken } = useSession();
  const [email, setEmail] = useState('');
  const [signInError, setSignInError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<ImagingOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [scopeLoading, setScopeLoading] = useState(false);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [offerCount, setOfferCount] = useState(0);
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
      if (orgRes.data.length === 1) {
        const only = orgRes.data[0];
        if (only) {
          setOrganizationId(only.id);
        }
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
    void fetchImagingOffers(token, organizationId)
      .then((body) => setOfferCount(body.data.length))
      .catch(() => setOfferCount(0));
  }, [getAccessToken, organizationId, session.status, tab]);

  if (session.status === 'expired') {
    return (
      <div className="radiology-body">
        <div className="shell-main">
          <SessionExpiredState action={{ label: 'Continue', onClick: () => selectTab('dashboard') }} />
        </div>
      </div>
    );
  }

  if (session.status !== 'authenticated') {
    return (
      <div className="radiology-body">
        <div className="shell-main wp-stack">
          <HeaderBar title="World Pharma Radiology">
            <Text size="caption">Radiology foundation (R8-A)</Text>
          </HeaderBar>
          <Card>
            <Heading level={2}>Sign in</Heading>
            <Text tone="secondary">OTP session for imaging center staff. No PACS console.</Text>
            <FormField label="Email">
              {({ id }) => (
                <Input id={id} value={email} onChange={(e) => setEmail(e.target.value)} />
              )}
            </FormField>
            {signInError ? <Text tone="secondary">{signInError}</Text> : null}
            <Button
              onClick={() => {
                setSignInError(null);
                void signInWithOtp(email.trim(), 'customer').catch((err: Error) =>
                  setSignInError(err.message),
                );
              }}
            >
              Continue with OTP
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const token = getAccessToken() ?? '';

  return (
    <div className="radiology-body">
      <div className="radiology-layout">
        <Sidebar
          items={NAV.map((item) => ({ id: item.id, label: item.label }))}
          current={tab}
        />
        <div className="shell-main wp-stack">
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
          <div className="radiology-tab-row">
            {NAV.map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={tab === item.id ? 'primary' : 'secondary'}
                onClick={() => selectTab(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>

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
                  <Heading level={2}>Dashboard</Heading>
                  <Text>
                    Offers on this imaging center: {offerCount}. Sandbox acquisition is enabled (R8-C). Interpretation,
                    reports, and production PACS/DICOM remain OFF.
                  </Text>
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
              {tab === 'schedule' ? (
                <LaterPhaseState title="Equipment schedule" phase="R8-B scheduling" />
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
                <LaterPhaseState title="Organization settings" phase="Later imaging ops settings" />
              ) : null}
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
        </div>
      </div>
    </div>
  );
}

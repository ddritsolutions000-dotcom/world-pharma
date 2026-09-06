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
import { LabApiError, fetchLabActivity, fetchLabCollections, fetchLabOffers, fetchLabOrganizations, fetchLabStaffBookings, type LabOrganization } from './lab-api';
import { LabAccessionPanel } from './lab-accession-panel';
import { LabBookingsPanel } from './lab-bookings-panel';
import { LabCapabilitiesPanel } from './lab-capabilities-panel';
import { LabCatalogPanel } from './lab-catalog-panel';
import { LabCollectionsPanel } from './lab-collections-panel';
import { LabPathologyPanel } from './lab-pathology-panel';
import { LabPhysicalPanel } from './lab-physical-panel';
import { LabProcessingPanel } from './lab-processing-panel';
import { LabEarningsPanel } from './lab-earnings-panel';
import { LabTeamPanel } from './lab-team-panel';
import { LabTransportPanel } from './lab-transport-panel';

type TabId =
  | 'dashboard'
  | 'organization'
  | 'capabilities'
  | 'catalog'
  | 'bookings'
  | 'collections'
  | 'transport'
  | 'accession'
  | 'processing'
  | 'pathology'
  | 'physical'
  | 'earnings'
  | 'team'
  | 'notifications'
  | 'support'
  | 'activity';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

const NAV: Array<{ id: TabId; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'organization', label: 'Organization' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'collections', label: 'Collections' },
  { id: 'transport', label: 'Transport' },
  { id: 'accession', label: 'Accession' },
  { id: 'processing', label: 'Processing' },
  { id: 'pathology', label: 'Pathology' },
  { id: 'physical', label: 'Physical' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'team', label: 'Team' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'support', label: 'Support' },
  { id: 'activity', label: 'Activity' },
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
  organizations: LabOrganization[];
  organizationId: string;
  onChange: (id: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return <LoadingState label="Preparing laboratory organizations…" />;
  }
  if (!organizations.length) {
    return (
      <EmptyState
        title="No laboratory organization"
        description="You need an active membership on a LAB organization. Apply as a lab partner, or sign in with the email your lab admin invited."
        action={{
          label: 'Apply as lab partner',
          onClick: () => {
            window.location.href = 'http://127.0.0.1:3008/lab';
          },
        }}
      />
    );
  }
  return (
    <Card>
      <FormField label="Laboratory organization">
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

export function LabShell() {
  const { session, signOut, expire, getAccessToken } = useSession();
  const [organizations, setOrganizations] = useState<LabOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [scopeLoading, setScopeLoading] = useState(false);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [offerCount, setOfferCount] = useState(0);
  const [bookingCount, setBookingCount] = useState(0);
  const [collectionCount, setCollectionCount] = useState(0);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [activityRows, setActivityRows] = useState<
    Array<{ id: string; type: string; outcome: string; created_at: string }>
  >([]);

  const selectedOrg = useMemo(
    () => organizations.find((org) => org.id === organizationId) ?? null,
    [organizationId, organizations],
  );

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof LabApiError) {
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
      const orgRes = await fetchLabOrganizations(token);
      setOrganizations(orgRes.data);
      if (orgRes.data.length >= 1) {
        setOrganizationId((current) => {
          if (current && orgRes.data.some((org) => org.id === current)) {
            return current;
          }
          return orgRes.data[0]!.id;
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
    setKpiLoading(true);
    void Promise.all([
      fetchLabOffers(token, organizationId)
        .then((body) => setOfferCount(body.data.length))
        .catch(() => setOfferCount(0)),
      fetchLabStaffBookings(token, organizationId)
        .then((body) => setBookingCount(body.data.length))
        .catch(() => setBookingCount(0)),
      fetchLabCollections(token, organizationId)
        .then((body) => setCollectionCount(body.data.length))
        .catch(() => setCollectionCount(0)),
    ]).finally(() => setKpiLoading(false));
  }, [getAccessToken, organizationId, session.status, tab]);

  if (session.status === 'expired') {
    return (
      <div className="portal-root lab-body" data-tone="lab">
        <div className="shell-main">
          <SessionExpiredState action={{ label: 'Continue', onClick: () => selectTab('dashboard') }} />
        </div>
      </div>
    );
  }

  if (session.status !== 'authenticated') {
    return <PortalAuthPage portalId="lab" />;
  }

  const token = getAccessToken() ?? '';

  return (
    <div className="portal-root lab-body" data-tone="lab">
      <PortalBrandBar portalLabel="Laboratory" />
      <HeaderBar title="Laboratory operations">
        <Text size="caption">
          {selectedOrg ? `${selectedOrg.display_name} · ${selectedOrg.country_code}` : 'Select a laboratory'}
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
              'Lab',
              tab,
              Object.fromEntries(NAV.map((item) => [item.id, item.label])),
            )}
          />
          <header className="wp-page-header">
            <Heading level={1}>Laboratory operations</Heading>
            <p className="wp-page-intro">
              Bookings, collections, accession, processing, and pathology reporting for your lab organization.
            </p>
          </header>
          <p className="wp-sandbox-banner" role="status">
            Sandbox lab workflows — not a live diagnostic network. Reports and settlements here are demo data.
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
                <div className="wp-stack">
                  <Card>
                    <Heading level={2}>Laboratory snapshot</Heading>
                    <Text tone="secondary">
                      Live queues for {selectedOrg?.display_name ?? 'your lab'} — same bookings customers place from the
                      store.
                    </Text>
                    {!organizationId ? (
                      <Text tone="secondary">Select a laboratory organization above to load queue metrics.</Text>
                    ) : kpiLoading ? (
                      <LoadingState label="Loading queue metrics…" />
                    ) : (
                      <PortalKpiCards
                        items={[
                          { label: 'Published tests', value: offerCount },
                          { label: 'Bookings', value: bookingCount },
                          { label: 'Collections', value: collectionCount },
                        ]}
                      />
                    )}
                    <div className="wp-quick-grid" style={{ marginTop: 16 }}>
                      <Button onClick={() => selectTab('bookings')}>Open bookings</Button>
                      <Button variant="secondary" onClick={() => selectTab('collections')}>
                        Open collections
                      </Button>
                      <Button variant="secondary" onClick={() => selectTab('pathology')}>
                        Pathology
                      </Button>
                      <Button variant="secondary" onClick={() => selectTab('earnings')}>
                        Earnings
                      </Button>
                    </div>
                  </Card>
                </div>
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
                      description="Choose a LAB organization to view membership context."
                    />
                  )}
                </Card>
              ) : null}
              {tab === 'capabilities' && organizationId ? (
                <LabCapabilitiesPanel
                  organizationId={organizationId}
                  token={token}
                  onError={handleApiError}
                />
              ) : null}
              {tab === 'catalog' && organizationId && selectedOrg ? (
                <LabCatalogPanel
                  organizationId={organizationId}
                  countryCode={selectedOrg.country_code}
                  token={token}
                  onError={handleApiError}
                />
              ) : null}
              {tab === 'bookings' && organizationId ? (
                <LabBookingsPanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {tab === 'collections' && organizationId ? (
                <LabCollectionsPanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {tab === 'transport' && organizationId ? (
                <LabTransportPanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {tab === 'accession' && organizationId ? (
                <LabAccessionPanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {tab === 'processing' && organizationId ? (
                <LabProcessingPanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {tab === 'pathology' && organizationId ? (
                <LabPathologyPanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {tab === 'physical' && organizationId ? (
                <LabPhysicalPanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {tab === 'earnings' && organizationId ? (
                <LabEarningsPanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {tab === 'team' && organizationId ? (
                <LabTeamPanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {!organizationId &&
              ['bookings', 'collections', 'transport', 'accession', 'processing', 'pathology', 'physical', 'earnings', 'team', 'catalog', 'capabilities', 'activity'].includes(
                tab,
              ) ? (
                <EmptyState
                  title="Select a laboratory"
                  description="Choose a LAB organization above to continue this workflow step."
                />
              ) : null}
              {tab === 'notifications' ? <PartnerInboxPanel token={token} audienceLabel="lab operators" /> : null}
              {tab === 'support' ? <PartnerSupportPanel token={token} audienceLabel="lab operators" /> : null}
              {tab === 'activity' && organizationId ? (
                <Card>
                  <Heading level={2}>Activity</Heading>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void fetchLabActivity(token, organizationId)
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
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

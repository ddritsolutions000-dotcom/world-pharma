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
import { LabApiError, fetchLabActivity, fetchLabOffers, fetchLabOrganizations, type LabOrganization } from './lab-api';
import { LabAccessionPanel } from './lab-accession-panel';
import { LabBookingsPanel } from './lab-bookings-panel';
import { LabCapabilitiesPanel } from './lab-capabilities-panel';
import { LabCatalogPanel } from './lab-catalog-panel';
import { LabCollectionsPanel } from './lab-collections-panel';
import { LabPathologyPanel } from './lab-pathology-panel';
import { LabPhysicalPanel } from './lab-physical-panel';
import { LabProcessingPanel } from './lab-processing-panel';
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
  | 'incidents'
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
  { id: 'incidents', label: 'Incidents' },
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
        description="You need an active membership on a LAB organization. Vendor, store, and clinic memberships are not shown here."
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

function LaterPhaseState({ title, phase }: { title: string; phase: string }) {
  return (
    <Card>
      <EmptyState
        title={title}
        description={`${phase} is planned after R7-A. This navigation slot is reserved without fake booking or clinical data.`}
      />
    </Card>
  );
}

export function LabShell() {
  const { session, signInWithOtp, signOut, expire, getAccessToken } = useSession();
  const [email, setEmail] = useState('');
  const [signInError, setSignInError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<LabOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [scopeLoading, setScopeLoading] = useState(false);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [offerCount, setOfferCount] = useState(0);
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
    void fetchLabOffers(token, organizationId)
      .then((body) => setOfferCount(body.data.length))
      .catch(() => setOfferCount(0));
  }, [getAccessToken, organizationId, session.status, tab]);

  if (session.status === 'expired') {
    return (
      <div className="lab-body">
        <div className="shell-main">
          <SessionExpiredState action={{ label: 'Continue', onClick: () => selectTab('dashboard') }} />
        </div>
      </div>
    );
  }

  if (session.status !== 'authenticated') {
    return (
      <div className="lab-body">
        <div className="shell-main wp-stack">
          <HeaderBar title="World Pharma Lab">
            <Text size="caption">Diagnostics foundation (R7-A)</Text>
          </HeaderBar>
          <Card>
            <Heading level={2}>Sign in</Heading>
            <Text tone="secondary">OTP session for lab partner staff. No LIS/HIS console.</Text>
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
    <div className="lab-body">
      <div className="lab-layout">
        <Sidebar
          items={NAV.map((item) => ({ id: item.id, label: item.label }))}
          current={tab}
        />
        <div className="shell-main wp-stack">
          <HeaderBar title="Laboratory operations">
            <Text size="caption">
              {selectedOrg
                ? `${selectedOrg.display_name} · ${selectedOrg.country_code} · sandbox`
                : 'Select a LAB organization'}
            </Text>
            <Button size="sm" variant="secondary" onClick={() => void signOut()}>
              Sign out
            </Button>
          </HeaderBar>
          <div className="lab-tab-row">
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
                    Offers on this lab: {offerCount}. Customer booking visibility is available; accession and
                    pathology remain locked until later R7 sub-phases.
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
              {tab === 'collections' && !organizationId ? (
                <EmptyState
                  title="Select a laboratory"
                  description="Choose a LAB organization to view the collection queue."
                />
              ) : null}
              {tab === 'bookings' && !organizationId ? (
                <EmptyState
                  title="Select a laboratory"
                  description="Choose a LAB organization to view bookings."
                />
              ) : null}
              {tab === 'transport' && organizationId ? (
                <LabTransportPanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {tab === 'transport' && !organizationId ? (
                <EmptyState title="Select a laboratory" description="Choose a LAB organization to view transport." />
              ) : null}
              {tab === 'accession' && organizationId ? (
                <LabAccessionPanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {tab === 'accession' && !organizationId ? (
                <EmptyState title="Select a laboratory" description="Choose a LAB organization for accession." />
              ) : null}
              {tab === 'processing' && organizationId ? (
                <LabProcessingPanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {tab === 'processing' && !organizationId ? (
                <EmptyState title="Select a laboratory" description="Choose a LAB organization for processing." />
              ) : null}
              {tab === 'pathology' && organizationId ? (
                <LabPathologyPanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {tab === 'pathology' && !organizationId ? (
                <EmptyState title="Select a laboratory" description="Choose a LAB organization for pathology." />
              ) : null}
              {tab === 'physical' && organizationId ? (
                <LabPhysicalPanel organizationId={organizationId} token={token} onError={handleApiError} />
              ) : null}
              {tab === 'physical' && !organizationId ? (
                <EmptyState title="Select a laboratory" description="Choose a LAB organization for physical reports." />
              ) : null}
              {tab === 'incidents' ? (
                <LaterPhaseState title="Incidents" phase="Later ops / support correlation" />
              ) : null}
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
              {(tab === 'capabilities' ||
                tab === 'catalog' ||
                tab === 'activity' ||
                tab === 'collections' ||
                tab === 'transport' ||
                tab === 'accession' ||
                tab === 'processing') &&
              !organizationId ? (
                <EmptyState
                  title="Select a laboratory"
                  description="Choose a LAB organization to continue."
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

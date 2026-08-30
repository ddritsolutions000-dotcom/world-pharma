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
  VendorApiError,
  fetchVendorLocations,
  fetchVendorLots,
  fetchVendorOffers,
  fetchVendorOrders,
  fetchVendorOrganizations,
  fetchVendorSettlements,
  fetchVendorShipments,
  type VendorOrganization,
} from './vendor-api';
import { VendorCatalogPanel } from './vendor-catalog-panel';
import { VendorInventoryPanel } from './vendor-inventory-panel';
import { VendorOrdersPanel } from './vendor-orders-panel';
import { VendorShipmentsPanel } from './vendor-shipments-panel';
import { VendorSettlementsPanel } from './vendor-settlements-panel';
import { VendorPricingPanel } from './vendor-pricing-panel';
import { VendorSupportPanel } from './vendor-support-panel';
import { VendorNotificationsPanel } from './vendor-notifications-panel';
import { VendorMarketplaceEligibilityPanel } from './vendor-marketplace-panel';
import { VendorActivityPanel } from './vendor-activity-panel';

type TabId =
  | 'dashboard'
  | 'organization'
  | 'profile'
  | 'marketplace'
  | 'catalog'
  | 'pricing'
  | 'inventory'
  | 'orders'
  | 'shipments'
  | 'settlements'
  | 'support'
  | 'notifications'
  | 'security'
  | 'audit';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

const NAV: Array<{ id: TabId; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'organization', label: 'Organization' },
  { id: 'profile', label: 'Profile' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'orders', label: 'Orders' },
  { id: 'shipments', label: 'Shipments' },
  { id: 'settlements', label: 'Settlement' },
  { id: 'support', label: 'Support' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Security' },
  { id: 'audit', label: 'Activity' },
];

const LIVE_TABS: TabId[] = [
  'dashboard',
  'organization',
  'profile',
  'marketplace',
  'catalog',
  'pricing',
  'inventory',
  'orders',
  'shipments',
  'settlements',
  'support',
  'notifications',
  'security',
  'audit',
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
  organizations: VendorOrganization[];
  organizationId: string;
  onChange: (id: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return <LoadingState label="Preparing seller organizations…" />;
  }
  if (!organizations.length) {
    return (
      <EmptyState
        title="No vendor organization"
        description="You need an active membership on a VENDOR organization. Clinic, pharmacy, and affiliate memberships are not shown here."
      />
    );
  }
  return (
    <Card>
      <FormField label="Seller organization">
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
        description={`${phase} is planned after R6-A. This navigation slot is reserved so the seller IA stays complete without pretending the workflow is live.`}
      />
    </Card>
  );
}

export function VendorShell() {
  const { session, signInWithOtp, signOut, expire, getAccessToken } = useSession();
  const [email, setEmail] = useState('');
  const [signInError, setSignInError] = useState<string | null>(null);

  const [organizations, setOrganizations] = useState<VendorOrganization[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [scopeLoading, setScopeLoading] = useState(false);

  const [tab, setTab] = useState<TabId>('dashboard');
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dashboardCounts, setDashboardCounts] = useState<Record<string, number>>({});
  const [locations, setLocations] = useState<Array<{ id: string; name: string; kind: string }>>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  const selectedOrg = useMemo(
    () => organizations.find((org) => org.id === organizationId) ?? null,
    [organizationId, organizations],
  );

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof VendorApiError) {
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
      const orgRes = await fetchVendorOrganizations(token);
      setOrganizations(orgRes.data);
      if (orgRes.data.length === 1) {
        const only = orgRes.data[0];
        if (only) {
          setOrganizationId(only.id);
        }
      }
      setViewState('idle');
    } catch (err) {
      handleApiError(err);
    } finally {
      setScopeLoading(false);
    }
  }, [getAccessToken, handleApiError]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'customer') {
      void loadScope();
    }
  }, [session.status, session.audience, loadScope]);

  const loadDashboard = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !organizationId) {
      return;
    }
    setViewState('loading');
    try {
      const [offers, lots, orders, shipments, settlements] = await Promise.all([
        fetchVendorOffers(token, organizationId),
        fetchVendorLots(token, organizationId),
        fetchVendorOrders(token, organizationId),
        fetchVendorShipments(token, organizationId),
        fetchVendorSettlements(token, organizationId),
      ]);
      setDashboardCounts({
        offers: offers.data.length,
        lots: lots.data.length,
        orders: orders.data.length,
        shipments: shipments.data.length,
        settlements: settlements.data.length,
      });
      setViewState('idle');
    } catch (err) {
      handleApiError(err);
    }
  }, [getAccessToken, handleApiError, organizationId]);

  const loadLocations = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !organizationId) {
      return;
    }
    setLocationsLoading(true);
    try {
      const body = await fetchVendorLocations(token, organizationId);
      setLocations(body.data.map((row) => ({ id: row.id, name: row.name, kind: row.kind })));
    } catch (err) {
      handleApiError(err);
    } finally {
      setLocationsLoading(false);
    }
  }, [getAccessToken, handleApiError, organizationId]);

  useEffect(() => {
    if (!organizationId) {
      return;
    }
    if (tab === 'dashboard') {
      void loadDashboard();
    } else if (tab === 'organization') {
      void loadLocations();
    } else if (LIVE_TABS.includes(tab)) {
      setViewState('idle');
      setErrorMessage(null);
    }
  }, [tab, organizationId, loadDashboard, loadLocations]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return (
      <main className="shell-main">
        <Heading level={1}>World Pharma Vendor</Heading>
        <Text tone="secondary">Seller workspace. Use OTP against the real API. Organization scope is server-enforced.</Text>
        <FormField label="Email">
          {({ id }) => <Input id={id} value={email} onChange={(e) => setEmail(e.target.value)} />}
        </FormField>
        <Button
          onClick={() => {
            void signInWithOtp(email, 'customer')
              .then(() => setSignInError(null))
              .catch((err: Error) => setSignInError(err.message));
          }}
        >
          Send OTP & sign in
        </Button>
        {signInError ? <NetworkErrorState action={{ label: 'Retry', onClick: () => setSignInError(null) }} /> : null}
      </main>
    );
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  const token = getAccessToken();
  const scoped = Boolean(organizationId && token);

  return (
    <div className="vendor-body">
      <HeaderBar title="World Pharma Vendor">
        <Button variant="secondary" size="sm" onClick={() => expire()}>
          Expire session
        </Button>
        <Button variant="tertiary" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
      </HeaderBar>
      <div className="vendor-layout">
        <Sidebar
          items={NAV.map((item) => ({ id: item.id, label: item.label }))}
          current={tab}
        />
        <main className="shell-main">
          <div className="wp-stack">
            <Heading level={1}>Seller workspace</Heading>
            <Text tone="secondary">
              Organization-scoped marketplace operations. Write workflows for catalog, inventory, and fulfillment land in later R6 phases.
            </Text>
            <OrgPicker
              organizations={organizations}
              organizationId={organizationId}
              onChange={setOrganizationId}
              loading={scopeLoading}
            />

            {scoped ? (
              <>
                <div className="vendor-tab-row" role="tablist" aria-label="Vendor sections">
                  {NAV.map((item) => (
                    <Button
                      key={item.id}
                      variant={tab === item.id ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => selectTab(item.id)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>

                {viewState === 'loading' && tab === 'dashboard' ? (
                  <LoadingState label="Checking medicine catalog and orders…" />
                ) : null}
                {viewState === 'forbidden' ? <PermissionDeniedState /> : null}
                {viewState === 'network' ? (
                  <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadDashboard() }} />
                ) : null}
                {viewState === 'error' && errorMessage ? (
                  <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadDashboard() }} />
                ) : null}

                {tab === 'dashboard' && viewState === 'idle' ? (
                  <Card>
                    <Heading level={2}>Operations snapshot</Heading>
                    <Text>Offers: {dashboardCounts.offers ?? 0}</Text>
                    <Text>Lots: {dashboardCounts.lots ?? 0}</Text>
                    <Text>Orders: {dashboardCounts.orders ?? 0}</Text>
                    <Text>Shipments: {dashboardCounts.shipments ?? 0}</Text>
                    <Text>Settlements: {dashboardCounts.settlements ?? 0}</Text>
                  </Card>
                ) : null}

                {tab === 'organization' ? (
                  <Card>
                    <Heading level={2}>Organization & locations</Heading>
                    {selectedOrg ? (
                      <>
                        <Text>
                          {selectedOrg.display_name} · {selectedOrg.kind} · {selectedOrg.country_code}
                        </Text>
                        <Text size="caption">Status {selectedOrg.status}</Text>
                      </>
                    ) : null}
                    {locationsLoading ? <LoadingState label="Loading warehouse locations…" /> : null}
                    {!locationsLoading && !locations.length ? (
                      <EmptyState
                        title="No locations yet"
                        description="Vendor warehouse locations will appear here. Creating locations remains available via API; write UX ships in R6-C."
                      />
                    ) : null}
                    {!locationsLoading && locations.length ? (
                      <Text>
                        {locations.map((row) => `${row.name} (${row.kind})`).join(' · ')}
                      </Text>
                    ) : null}
                  </Card>
                ) : null}

                {tab === 'profile' && selectedOrg ? (
                  <Card>
                    <Heading level={2}>Seller profile</Heading>
                    <Text>{selectedOrg.display_name}</Text>
                    <Text tone="secondary">{selectedOrg.legal_name}</Text>
                    <Text size="caption">
                      Role {selectedOrg.role_name} ({selectedOrg.role_code}) · Country {selectedOrg.country_code}
                    </Text>
                    <Text size="caption">KYC / Join flows remain on web-join. R6-A shows membership context only.</Text>
                  </Card>
                ) : null}

                {tab === 'marketplace' && token ? (
                  <VendorMarketplaceEligibilityPanel
                    organizationId={organizationId}
                    token={token}
                    onError={handleApiError}
                  />
                ) : null}
                {tab === 'catalog' && token ? (
                  <VendorCatalogPanel
                    organizationId={organizationId}
                    countryCode={selectedOrg?.country_code ?? ''}
                    token={token}
                    onError={handleApiError}
                  />
                ) : null}
                {tab === 'pricing' && token ? (
                  <VendorPricingPanel organizationId={organizationId} token={token} onError={handleApiError} />
                ) : null}
                {tab === 'inventory' && token ? (
                  <VendorInventoryPanel organizationId={organizationId} token={token} onError={handleApiError} />
                ) : null}
                {tab === 'orders' && token ? (
                  <VendorOrdersPanel organizationId={organizationId} token={token} onError={handleApiError} />
                ) : null}
                {tab === 'shipments' && token ? (
                  <VendorShipmentsPanel organizationId={organizationId} token={token} onError={handleApiError} />
                ) : null}
                {tab === 'settlements' && token ? (
                  <VendorSettlementsPanel organizationId={organizationId} token={token} onError={handleApiError} />
                ) : null}
                {tab === 'support' && token ? (
                  <VendorSupportPanel organizationId={organizationId} token={token} onError={handleApiError} />
                ) : null}
                {tab === 'notifications' && token ? (
                  <VendorNotificationsPanel token={token} onError={handleApiError} />
                ) : null}
                {tab === 'security' ? (
                  <Card>
                    <Heading level={2}>Security & account</Heading>
                    <Text>Signed in with real OTP session (audience: customer).</Text>
                    <Text size="caption">Session expire and sign-out are available in the header. Device management reuses identity /me APIs in a later polish pass.</Text>
                  </Card>
                ) : null}
                {tab === 'audit' && token ? (
                  <VendorActivityPanel organizationId={organizationId} token={token} onError={handleApiError} />
                ) : null}
              </>
            ) : organizations.length ? (
              <EmptyState title="Select an organization" description="Choose your vendor organization to begin." />
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

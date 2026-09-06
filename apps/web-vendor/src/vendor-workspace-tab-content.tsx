'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  EmptyState,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
} from '@world-pharma/ui-kit/web';
import { VendorActivityPanel } from './vendor-activity-panel';
import { VendorCatalogPanel } from './vendor-catalog-panel';
import { VendorCompliancePanel } from './vendor-compliance-panel';
import { VendorDashboardPanel } from './vendor-dashboard-panel';
import { VendorInventoryPanel } from './vendor-inventory-panel';
import { VendorMarketplaceEligibilityPanel } from './vendor-marketplace-panel';
import { VendorNotificationsPanel } from './vendor-notifications-panel';
import { VendorOrdersPanel } from './vendor-orders-panel';
import { VendorOrganizationPanel } from './vendor-organization-panel';
import { VendorPageHeader } from './vendor-page-header';
import { VendorPricingPanel } from './vendor-pricing-panel';
import { VendorProfilePanel } from './vendor-profile-panel';
import { VendorReturnsPanel } from './vendor-returns-panel';
import { VendorReportsPanel } from './vendor-reports-panel';
import { VendorSecurityPanel } from './vendor-security-panel';
import { VendorSettingsPanel } from './vendor-settings-panel';
import { VendorSettlementsPanel } from './vendor-settlements-panel';
import { VendorShipmentsPanel } from './vendor-shipments-panel';
import { VendorSupportPanel } from './vendor-support-panel';
import { VendorTeamPanel } from './vendor-team-panel';
import { useVendorWorkspace } from './vendor-workspace-context';
import { vendorTabPath, type VendorTabId } from './vendor-workspace-nav';

function readParam(searchParams: ReturnType<typeof useSearchParams>, key: string): string | undefined {
  const value = searchParams.get(key);
  return value || undefined;
}

export function VendorWorkspaceTabContent({ tab }: { tab: VendorTabId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    organizationId,
    selectedOrg,
    token,
    scoped,
    scopeLoading,
    scopeError,
    organizations,
    viewState,
    errorMessage,
    onError,
    resetViewState,
    reloadScope,
    signOut,
  } = useVendorWorkspace();

  useEffect(() => {
    resetViewState();
  }, [tab, resetViewState]);

  if (scopeLoading) {
    return <LoadingState label="Loading seller organization…" />;
  }

  if (scopeError) {
    return (
      <NetworkErrorState
        action={{
          label: 'Retry',
          onClick: () => {
            void reloadScope();
          },
        }}
      />
    );
  }

  if (!scoped && organizations.length === 0) {
    return (
      <EmptyState
        title="No vendor organization"
        description="You need an active membership on a VENDOR marketplace seller organization. Sign in with sandbox-vendor@dev.local after running the API seed."
      />
    );
  }

  if (!scoped && organizations.length > 0) {
    return (
      <EmptyState
        title="Select an organization"
        description="Choose your seller organization from the sidebar to open this page."
      />
    );
  }

  const navigate = (id: VendorTabId) => {
    router.push(vendorTabPath(id));
  };

  return (
    <div className="vws-page">
      {tab !== 'dashboard' ? <VendorPageHeader tab={tab} /> : null}

      {viewState === 'forbidden' ? <PermissionDeniedState /> : null}
      {viewState === 'network' && tab !== 'dashboard' ? <NetworkErrorState /> : null}
      {viewState === 'error' && errorMessage && tab !== 'dashboard' ? <NetworkErrorState /> : null}

      {tab === 'dashboard' && token ? (
        <VendorDashboardPanel
          organizationId={organizationId}
          organization={selectedOrg}
          token={token}
          onNavigate={navigate}
          onError={onError}
        />
      ) : null}

      {tab === 'organization' && token ? (
        <VendorOrganizationPanel
          organization={selectedOrg}
          organizationId={organizationId}
          token={token}
          onError={onError}
        />
      ) : null}

      {tab === 'profile' && selectedOrg ? <VendorProfilePanel organization={selectedOrg} /> : null}

      {tab === 'marketplace' && token ? (
        <VendorMarketplaceEligibilityPanel
          organizationId={organizationId}
          token={token}
          onError={onError}
        />
      ) : null}

      {tab === 'catalog' && token ? (
        <VendorCatalogPanel
          organizationId={organizationId}
          countryCode={selectedOrg?.country_code ?? ''}
          token={token}
          onError={onError}
        />
      ) : null}

      {tab === 'pricing' && token ? (
        <VendorPricingPanel organizationId={organizationId} token={token} onError={onError} />
      ) : null}

      {tab === 'inventory' && token ? (
        <VendorInventoryPanel organizationId={organizationId} token={token} onError={onError} />
      ) : null}

      {tab === 'orders' && token ? (
        <VendorOrdersPanel
          organizationId={organizationId}
          token={token}
          onError={onError}
          initialOrderId={readParam(searchParams, 'orderId')}
        />
      ) : null}

      {tab === 'returns' && token ? (
        <VendorReturnsPanel organizationId={organizationId} token={token} onError={onError} />
      ) : null}

      {tab === 'shipments' && token ? (
        <VendorShipmentsPanel
          organizationId={organizationId}
          token={token}
          onError={onError}
          initialShipmentId={readParam(searchParams, 'shipmentId')}
        />
      ) : null}

      {tab === 'settlements' && token ? (
        <VendorSettlementsPanel
          organizationId={organizationId}
          token={token}
          onError={onError}
          initialSettlementId={readParam(searchParams, 'settlementId')}
        />
      ) : null}

      {tab === 'support' && token ? (
        <VendorSupportPanel
          organizationId={organizationId}
          token={token}
          onError={onError}
          initialTicketId={readParam(searchParams, 'ticketId')}
        />
      ) : null}

      {tab === 'notifications' && token ? (
        <VendorNotificationsPanel token={token} onError={onError} />
      ) : null}

      {tab === 'security' ? <VendorSecurityPanel onSignOut={() => signOut()} /> : null}

      {tab === 'audit' && token ? (
        <VendorActivityPanel organizationId={organizationId} token={token} onError={onError} />
      ) : null}

      {tab === 'compliance' && token ? (
        <VendorCompliancePanel
          organizationId={organizationId}
          organization={selectedOrg}
          token={token}
          onError={onError}
          onNavigate={() => navigate('marketplace')}
        />
      ) : null}

      {tab === 'reports' && token ? (
        <VendorReportsPanel
          organizationId={organizationId}
          organization={selectedOrg}
          token={token}
          onError={onError}
        />
      ) : null}

      {tab === 'settings' ? <VendorSettingsPanel onNavigate={navigate} /> : null}

      {tab === 'team' && token ? (
        <VendorTeamPanel
          organizationId={organizationId}
          countryCode={selectedOrg?.country_code ?? ''}
          token={token}
          onError={onError}
        />
      ) : null}
    </div>
  );
}

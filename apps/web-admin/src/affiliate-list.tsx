'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminViewLoadError } from './admin-request-error';
import { classifyAdminViewState } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  PermissionDeniedState,
  Select,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  adminCreateReferralCode,
  AffiliateApiError,
  approveAffiliateLiability,
  listAffiliatePartners,
  reverseAffiliateLiability,
  type AffiliatePartner,
} from './affiliate-api';
import { fetchAdminOrders, type AdminOrderSummary } from './orders-admin-api';
import { workingCountry, MARKET_COUNTRY_CODES } from './working-country';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

function affiliateStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

export function AffiliateAdminHub() {
  const { getAccessToken, session } = useSession();
  const [partners, setPartners] = useState<AffiliatePartner[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [countryCode, setCountryCode] = useState(() => workingCountry(session.countryCode));
  const [organizationId, setOrganizationId] = useState('');
  const [code, setCode] = useState('');
  const [formError, setFormError] = useState('');
  const [financeOrderId, setFinanceOrderId] = useState('');
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [financeMessage, setFinanceMessage] = useState('');
  const canManage = session.permissions.includes('affiliate:manage');
  const canFinance = session.permissions.includes('finance:approve');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await listAffiliatePartners(token, countryCode);
      setPartners(body.data ?? []);
      try {
        const nextOrders = await fetchAdminOrders(token);
        setOrders(nextOrders);
        setFinanceOrderId((current) => current || nextOrders[0]?.id || '');
      } catch {
        setOrders([]);
      }
      setViewState('idle');
    } catch (err) {
      if (err instanceof AffiliateApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState(classifyAdminViewState(err));
    }
  }, [countryCode, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  async function handleCreate() {
    const token = getAccessToken();
    if (!token || !organizationId || !code.trim()) {
      return;
    }
    setFormError('');
    try {
      await adminCreateReferralCode(token, {
        country_code: countryCode,
        organization_id: organizationId,
        code: code.trim(),
      });
      setCode('');
      await load();
    } catch (err) {
      setFormError(err instanceof AffiliateApiError ? err.message : 'Create failed');
    }
  }

  async function handleFinanceAction(action: 'approve' | 'reverse') {
    const token = getAccessToken();
    if (!token || !financeOrderId.trim()) {
      return;
    }
    setFinanceMessage('');
    try {
      if (action === 'approve') {
        await approveAffiliateLiability(token, financeOrderId.trim());
        setFinanceMessage('Affiliate liability approved for order.');
      } else {
        await reverseAffiliateLiability(token, financeOrderId.trim());
        setFinanceMessage('Affiliate liability reversed for order.');
      }
    } catch (err) {
      setFinanceMessage(err instanceof AffiliateApiError ? err.message : 'Finance action failed');
    }
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (viewState === 'loading' && partners.length === 0) {
    return <LoadingState label="Loading partners" />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Affiliate partners</Heading>
        <p className="wp-page-intro">
          Partner list, referral code provisioning, and company-controlled affiliate liability actions.
        </p>
      </header>
      <div className="wp-toolbar">
        <FormField label="Country">
          {({ id }) => (
            <Select id={id} value={countryCode} onChange={(e) => setCountryCode(workingCountry(e.target.value))}>
              {MARKET_COUNTRY_CODES.map((iso) => (
                <option key={iso} value={iso}>
                  {iso}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button variant="secondary" onClick={() => void load()} disabled={viewState === 'loading'}>
          {viewState === 'loading' ? 'Refreshing…' : 'Refresh partners'}
        </Button>
      </div>
      <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />
      {partners.length === 0 && viewState === 'idle' ? (
        <EmptyState title="No affiliate partners" description="No AFFILIATE_ORG organizations in this country." />
      ) : (
        <div className="wp-admin-table-wrap">
          <table className="wp-table">
            <thead>
              <tr>
                <th>Partner</th>
                <th>Status</th>
                <th>Org</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((partner) => (
                <tr key={partner.id}>
                  <td>{partner.display_name}</td>
                  <td>
                    <span className="wp-status">{affiliateStatusLabel(partner.status)}</span>
                  </td>
                  <td>{partner.id.slice(0, 8)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canManage ? (
        <Card>
          <h2 className="wp-section-title">Create referral code</h2>
          <div className="wp-form-grid">
          <FormField label="Organization">
            {({ id }) => (
              <Select id={id} value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
                <option value="">Select affiliate partner</option>
                {partners.map((partner) => (
                  <option key={partner.id} value={partner.id}>
                    {partner.display_name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Code">
            {({ id }) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />}
          </FormField>
          <div className="wp-form-actions">
          <Button onClick={() => void handleCreate()}>Create referral code</Button>
          </div>
          </div>
        </Card>
      ) : (
        <Text tone="secondary">affiliate:manage required to provision codes.</Text>
      )}
      {formError ? <p className="wp-text-muted">{formError}</p> : null}
      {canFinance ? (
        <Card>
          <h2 className="wp-section-title">Affiliate liability (company finance)</h2>
          <p className="wp-page-intro">
            Approve or reverse affiliate commission liability for an attributed order. Live payout stays disabled in
            sandbox.
          </p>
          <FormField label="Order">
            {({ id }) =>
              orders.length ? (
                <Select id={id} value={financeOrderId} onChange={(e) => setFinanceOrderId(e.target.value)}>
                  {orders.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.order_number} · {row.status}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input id={id} value={financeOrderId} onChange={(e) => setFinanceOrderId(e.target.value)} />
              )
            }
          </FormField>
          <div className="wp-toolbar">
            <Button onClick={() => void handleFinanceAction('approve')}>Approve liability</Button>
            <Button variant="secondary" onClick={() => void handleFinanceAction('reverse')}>
              Reverse liability
            </Button>
          </div>
          {financeMessage ? <p className="wp-text-muted">{financeMessage}</p> : null}
        </Card>
      ) : (
        <Text tone="secondary">finance:approve required for affiliate liability actions.</Text>
      )}
    </div>
  );
}

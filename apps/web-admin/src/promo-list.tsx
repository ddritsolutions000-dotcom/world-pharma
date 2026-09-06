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
  createPromoCampaign,
  listPromoCampaigns,
  listPromoRedemptions,
  PromoApiError,
  updatePromoCampaign,
  type PromoCampaign,
} from './promo-api';
import { workingCountry, MARKET_COUNTRY_CODES } from './working-country';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

function promoStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

export function PromoHub() {
  const { getAccessToken, session } = useSession();
  const [campaigns, setCampaigns] = useState<PromoCampaign[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [countryCode, setCountryCode] = useState(() => workingCountry(session.countryCode));
  const [code, setCode] = useState('');
  const [percentBps, setPercentBps] = useState('1000');
  const [minBasket, setMinBasket] = useState('0');
  const [formError, setFormError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [redemptions, setRedemptions] = useState<{ id: string; discount_minor: string; created_at: string }[]>([]);
  const canManage = session.permissions.includes('promo:manage');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await listPromoCampaigns(token, countryCode);
      setCampaigns(body.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof PromoApiError && err.status === 403) {
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

  async function createCampaign() {
    const token = getAccessToken();
    if (!token || !code.trim()) {
      return;
    }
    setFormError('');
    try {
      await createPromoCampaign(token, {
        country_code: countryCode,
        code: code.trim(),
        kind: 'PERCENT',
        percent_bps: Number(percentBps) || 0,
        min_basket_minor: minBasket || '0',
        funding: 'PLATFORM',
      });
      setCode('');
      await load();
    } catch (err) {
      setFormError(err instanceof PromoApiError ? err.message : 'Create failed');
    }
  }

  async function setPromoStatus(campaign: PromoCampaign, status: 'ACTIVE' | 'PAUSED' | 'EXPIRED') {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setFormError('');
    try {
      await updatePromoCampaign(token, campaign.id, {
        country_code: countryCode,
        status,
        version: campaign.version,
      });
      await load();
    } catch (err) {
      setFormError(err instanceof PromoApiError ? err.message : 'Status update failed');
    }
  }

  async function loadRedemptions(campaignId: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setSelectedId(campaignId);
    try {
      const body = await listPromoRedemptions(token, campaignId, countryCode);
      setRedemptions(body.data ?? []);
    } catch (err) {
      setFormError(err instanceof PromoApiError ? err.message : 'Redemptions failed');
    }
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Promo campaigns</Heading>
        <p className="wp-page-intro">Checkout promo codes. Create a draft, then Activate so it can apply at quote time.</p>
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
          {viewState === 'loading' ? 'Refreshing…' : 'Refresh campaigns'}
        </Button>
      </div>
      <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />
      {viewState === 'loading' && campaigns.length === 0 ? <LoadingState label="Loading promos" /> : null}
      {canManage ? (
        <Card>
          <h2 className="wp-section-title">Create draft</h2>
          <div className="wp-form-grid">
          <FormField label="Code">
            {({ id }) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />}
          </FormField>
          <FormField label="Percent (bps)">
            {({ id }) => <Input id={id} value={percentBps} onChange={(e) => setPercentBps(e.target.value)} />}
          </FormField>
          <FormField label="Min basket (minor)">
            {({ id }) => <Input id={id} value={minBasket} onChange={(e) => setMinBasket(e.target.value)} />}
          </FormField>
          <div className="wp-form-actions">
          <Button onClick={() => void createCampaign()}>Create draft</Button>
          </div>
          </div>
        </Card>
      ) : null}
      {formError ? <p className="wp-text-muted">{formError}</p> : null}
      {!campaigns.length && viewState === 'idle' ? (
        <EmptyState title="No promos" description="Create a draft campaign to get started." />
      ) : (
        <div className="wp-admin-table-wrap">
          <table className="wp-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Status</th>
                <th>Discount</th>
                <th>Redeemed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className={selectedId === campaign.id ? 'wp-admin-row-active' : undefined}>
                  <td>{campaign.code}</td>
                  <td>
                    <span className="wp-status">{promoStatusLabel(campaign.status)}</span>
                  </td>
                  <td>{campaign.percent_bps} bps</td>
                  <td>
                    {campaign.redeemed_count}
                    {campaign.max_redemptions != null ? ` / ${campaign.max_redemptions}` : ''}
                  </td>
                  <td>
                    <div className="wp-row-actions">
                      {canManage && campaign.status === 'DRAFT' ? (
                        <Button size="sm" onClick={() => void setPromoStatus(campaign, 'ACTIVE')}>
                          Activate
                        </Button>
                      ) : null}
                      {canManage && campaign.status === 'ACTIVE' ? (
                        <Button size="sm" variant="secondary" onClick={() => void setPromoStatus(campaign, 'PAUSED')}>
                          Pause
                        </Button>
                      ) : null}
                      {canManage && campaign.status === 'PAUSED' ? (
                        <Button size="sm" onClick={() => void setPromoStatus(campaign, 'ACTIVE')}>
                          Resume
                        </Button>
                      ) : null}
                      {canManage && (campaign.status === 'ACTIVE' || campaign.status === 'PAUSED') ? (
                        <Button size="sm" variant="ghost" onClick={() => void setPromoStatus(campaign, 'EXPIRED')}>
                          Expire
                        </Button>
                      ) : null}
                      <Button size="sm" variant="secondary" onClick={() => void loadRedemptions(campaign.id)}>
                        Redemptions
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selectedId ? (
        <Card>
          <h2 className="wp-section-title">Redemptions</h2>
          {redemptions.length === 0 ? (
            <Text size="caption">No redemptions yet.</Text>
          ) : (
            <ul className="wp-event-list">
              {redemptions.map((row) => (
                <li key={row.id}>
                  <Text size="caption">
                    {row.discount_minor} at {new Date(row.created_at).toLocaleString()}
                  </Text>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}

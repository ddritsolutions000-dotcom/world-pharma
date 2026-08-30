'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
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

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network';

export function PromoHub() {
  const { getAccessToken, session } = useSession();
  const [campaigns, setCampaigns] = useState<PromoCampaign[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [countryCode, setCountryCode] = useState('XX');
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
      setViewState('network');
    }
  }, [countryCode, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function activateCampaign(campaign: PromoCampaign) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setFormError('');
    try {
      await updatePromoCampaign(token, campaign.id, {
        country_code: countryCode,
        status: 'ACTIVE',
        version: campaign.version,
      });
      await load();
    } catch (err) {
      setFormError(err instanceof PromoApiError ? err.message : 'Activate failed');
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

  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (viewState === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }

  if (viewState === 'loading' && campaigns.length === 0) {
    return <LoadingState label="Loading promos" />;
  }

  return (
    <section>
      <Heading level={1}>Promo campaigns</Heading>
      <Text tone="secondary">Manage checkout promo codes. Discounts are calculated server-side at quote time.</Text>
      <FormField label="Country code">
        {({ id }) => (
          <Input id={id} value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} />
        )}
      </FormField>
      {canManage ? (
        <Card>
          <Heading level={2}>Create draft</Heading>
          <FormField label="Code">
            {({ id }) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />}
          </FormField>
          <FormField label="Percent (bps)">
            {({ id }) => <Input id={id} value={percentBps} onChange={(e) => setPercentBps(e.target.value)} />}
          </FormField>
          <FormField label="Min basket (minor)">
            {({ id }) => <Input id={id} value={minBasket} onChange={(e) => setMinBasket(e.target.value)} />}
          </FormField>
          <Button onClick={() => void createCampaign()}>Create draft</Button>
        </Card>
      ) : null}
      {formError ? <Text tone="secondary">{formError}</Text> : null}
      {campaigns.length === 0 ? (
        <EmptyState title="No promos" description="Create a draft campaign to get started." />
      ) : (
        campaigns.map((campaign) => (
          <Card key={campaign.id}>
            <Text>
              {campaign.code} — {campaign.status} — {campaign.percent_bps} bps
            </Text>
            <Text size="caption">
              Redeemed {campaign.redeemed_count}
              {campaign.max_redemptions != null ? ` / ${campaign.max_redemptions}` : ''}
            </Text>
            {canManage && campaign.status === 'DRAFT' ? (
              <Button onClick={() => void activateCampaign(campaign)}>Activate</Button>
            ) : null}
            <Button onClick={() => void loadRedemptions(campaign.id)}>Redemptions</Button>
          </Card>
        ))
      )}
      {selectedId ? (
        <Card>
          <Heading level={2}>Redemptions</Heading>
          {redemptions.length === 0 ? (
            <Text size="caption">No redemptions yet.</Text>
          ) : (
            redemptions.map((row) => (
              <Text key={row.id} size="caption">
                {row.discount_minor} at {row.created_at}
              </Text>
            ))
          )}
        </Card>
      ) : null}
    </section>
  );
}

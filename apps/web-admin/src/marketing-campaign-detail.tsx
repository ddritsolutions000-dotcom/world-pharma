'use client';

import Link from 'next/link';
import { AdminViewLoadError } from './admin-request-error';
import { classifyAdminViewState } from './admin-http';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  getMarketingCampaign,
  listCampaignSends,
  MarketingApiError,
  scheduleCampaign,
  sendCampaign,
  type CampaignSendRow,
  type MarketingCampaign,
} from './marketing-api';
import { workingCountry } from './working-country';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error' | 'not_found';

export function MarketingCampaignDetail({ campaignId }: { campaignId: string }) {
  const searchParams = useSearchParams();
  const { getAccessToken, session } = useSession();
  const countryCode = workingCountry(searchParams.get('country') ?? session.countryCode);
  const [data, setData] = useState<MarketingCampaign | null>(null);
  const [sends, setSends] = useState<CampaignSendRow[]>([]);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const canSend = session.permissions.includes('campaign:send');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const [campaign, sendBody] = await Promise.all([
        getMarketingCampaign(token, campaignId, countryCode),
        listCampaignSends(token, campaignId, countryCode),
      ]);
      setData(campaign);
      setSends(sendBody.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof MarketingApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      if (err instanceof MarketingApiError && err.status === 404) {
        setViewState('not_found');
        return;
      }
      setViewState(classifyAdminViewState(err));
    }
  }, [campaignId, countryCode, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSchedule() {
    const token = getAccessToken();
    if (!token || !data) {
      return;
    }
    setError('');
    setMessage('');
    try {
      await scheduleCampaign(token, data.id, countryCode, data.version);
      setMessage('Campaign scheduled');
      await load();
    } catch (err) {
      if (err instanceof MarketingApiError && err.status === 409) {
        setError('Conflict — refresh and retry');
        return;
      }
      setError(err instanceof MarketingApiError ? err.message : 'Schedule failed');
    }
  }

  async function runSend() {
    const token = getAccessToken();
    if (!token || !data) {
      return;
    }
    setError('');
    setMessage('');
    try {
      const result = await sendCampaign(token, data.id, countryCode);
      setMessage(`Send complete — sent ${result.sent_count}, skipped ${result.skipped_count}`);
      await load();
    } catch (err) {
      setError(err instanceof MarketingApiError ? err.message : 'Send failed');
    }
  }

  if (viewState === 'loading') {
    return <LoadingState label="Loading campaign" />;
  }
  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (viewState === 'not_found') {
    return <EmptyState title="Campaign not found" description="Check country code and campaign id." />;
  }
  if (viewState === 'network' || viewState === 'error') {
    return <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />;
  }
  if (!data) {
    return null;
  }

  return (
    <div className="wp-stack">
      <Heading level={1}>{data.name}</Heading>
      <Text tone="secondary">
        {data.code} · {data.status} · channel {data.channel} · segment {data.segment?.code ?? data.segment_id}
      </Text>
      <Link href="/marketing">
        <Button variant="secondary">Back to marketing</Button>
      </Link>

      <Card>
        <Heading level={2}>Creative</Heading>
        <Text>Title: {data.title}</Text>
        <Text>Body: {data.body}</Text>
      </Card>

      {canSend ? (
        <Card>
          <Heading level={2}>Workflow</Heading>
          <div className="wp-stack">
            <Button onClick={() => void runSchedule()} disabled={data.status !== 'DRAFT'}>
              Schedule
            </Button>
            <Button onClick={() => void runSend()} disabled={data.status !== 'SCHEDULED' && data.status !== 'SENDING'}>
              Send batch (consent-gated)
            </Button>
            {message ? <Text tone="secondary">{message}</Text> : null}
            {error ? <Text tone="secondary">{error}</Text> : null}
          </div>
        </Card>
      ) : (
        <Text tone="secondary">Read-only — requires campaign:send</Text>
      )}

      <Card>
        <Heading level={2}>Send log ({sends.length})</Heading>
        {sends.length === 0 ? (
          <Text tone="secondary">No sends yet</Text>
        ) : (
          <ul>
            {sends.map((row) => (
              <li key={row.id}>
                {row.person_id.slice(0, 8)}… — {row.status}
                {row.skip_reason ? ` (${row.skip_reason})` : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

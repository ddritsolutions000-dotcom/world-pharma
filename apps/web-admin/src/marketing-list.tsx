'use client';

import Link from 'next/link';
import { classifyAdminViewState } from './admin-http';
import { AdminViewLoadError } from './admin-request-error';
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
  PermissionDeniedState,
  Select,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  createMarketingCampaign,
  createMarketingSegment,
  listMarketingCampaigns,
  listMarketingSegments,
  MarketingApiError,
  type MarketingCampaign,
  type MarketingSegment,
} from './marketing-api';
import { workingCountry, MARKET_COUNTRY_CODES } from './working-country';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

export function MarketingHub() {
  const { getAccessToken, session } = useSession();
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [segments, setSegments] = useState<MarketingSegment[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [countryCode, setCountryCode] = useState(() => workingCountry(session.countryCode));
  const [segmentCode, setSegmentCode] = useState('');
  const [segmentName, setSegmentName] = useState('');
  const [campaignCode, setCampaignCode] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignBody, setCampaignBody] = useState('');
  const [campaignSegmentId, setCampaignSegmentId] = useState('');
  const [formError, setFormError] = useState('');
  const canSend = session.permissions.includes('campaign:send');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const [campaignBody, segmentBody] = await Promise.all([
        listMarketingCampaigns(token, countryCode),
        listMarketingSegments(token, countryCode),
      ]);
      setCampaigns(campaignBody.data ?? []);
      setSegments(segmentBody.data ?? []);
      setViewState('idle');
    } catch (err) {
      if (err instanceof MarketingApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState(classifyAdminViewState(err));
    }
  }, [countryCode, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSegment() {
    const token = getAccessToken();
    if (!token || !segmentCode.trim() || !segmentName.trim()) {
      return;
    }
    setFormError('');
    try {
      await createMarketingSegment(token, {
        country_code: countryCode,
        code: segmentCode.trim(),
        name: segmentName.trim(),
        rules: { type: 'all' },
        status: 'ACTIVE',
      });
      setSegmentCode('');
      setSegmentName('');
      await load();
    } catch (err) {
      setFormError(err instanceof MarketingApiError ? err.message : 'Segment create failed');
    }
  }

  async function createCampaign() {
    const token = getAccessToken();
    if (!token || !campaignCode.trim() || !campaignName.trim() || !campaignSegmentId) {
      return;
    }
    setFormError('');
    try {
      await createMarketingCampaign(token, {
        country_code: countryCode,
        code: campaignCode.trim(),
        name: campaignName.trim(),
        segment_id: campaignSegmentId,
        title: campaignTitle.trim() || campaignName.trim(),
        body: campaignBody.trim() || 'Operational marketing message',
        channel: 'IN_APP',
      });
      setCampaignCode('');
      setCampaignName('');
      setCampaignTitle('');
      setCampaignBody('');
      await load();
    } catch (err) {
      setFormError(err instanceof MarketingApiError ? err.message : 'Campaign create failed');
    }
  }

  if (viewState === 'loading' && campaigns.length === 0 && segments.length === 0) {
    return <LoadingState label="Loading marketing" />;
  }
  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Marketing</Heading>
        <p className="wp-page-intro">
          Consent-gated in-app campaigns only. Sends require durable marketing opt-in; suppressions always win.
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
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
      <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />

      {canSend ? (
        <Card>
          <Heading level={2}>Create segment</Heading>
          <div className="wp-stack">
            <FormField label="Segment code">
              {({ id }) => <Input id={id} value={segmentCode} onChange={(e) => setSegmentCode(e.target.value)} />}
            </FormField>
            <FormField label="Segment name">
              {({ id }) => <Input id={id} value={segmentName} onChange={(e) => setSegmentName(e.target.value)} />}
            </FormField>
            <Button onClick={() => void createSegment()}>Create segment (all customers)</Button>
          </div>
        </Card>
      ) : null}

      {canSend ? (
        <Card>
          <Heading level={2}>Create campaign</Heading>
          <div className="wp-stack">
            <FormField label="Segment">
              {({ id }) => (
                <Select id={id} value={campaignSegmentId} onChange={(e) => setCampaignSegmentId(e.target.value)}>
                  <option value="">Select segment</option>
                  {segments.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} ({row.code})
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label="Campaign code">
              {({ id }) => <Input id={id} value={campaignCode} onChange={(e) => setCampaignCode(e.target.value)} />}
            </FormField>
            <FormField label="Campaign name">
              {({ id }) => <Input id={id} value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />}
            </FormField>
            <FormField label="Title">
              {({ id }) => <Input id={id} value={campaignTitle} onChange={(e) => setCampaignTitle(e.target.value)} />}
            </FormField>
            <FormField label="Body">
              {({ id }) => <Input id={id} value={campaignBody} onChange={(e) => setCampaignBody(e.target.value)} />}
            </FormField>
            <Button onClick={() => void createCampaign()}>Create campaign</Button>
            {formError ? <Text tone="secondary">{formError}</Text> : null}
          </div>
        </Card>
      ) : (
        <Text tone="secondary">Read-only — campaign create/send requires campaign:send</Text>
      )}

      <Card>
        <Heading level={2}>Campaigns ({campaigns.length})</Heading>
        {campaigns.length === 0 ? (
          <EmptyState title="No campaigns" description="Create a segment first, then a campaign." />
        ) : (
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campaigns.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.name} ({row.code})
                    </td>
                    <td>
                      <span className="wp-status">{row.status}</span>
                    </td>
                    <td>
                      <Link href={`/marketing/campaigns/${row.id}?country=${countryCode}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <Heading level={2}>Segments ({segments.length})</Heading>
        {segments.length === 0 ? (
          <EmptyState title="No segments" description="Segments use non-clinical rules v1 only." />
        ) : (
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Segment</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {segments.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.name} ({row.code})
                    </td>
                    <td>
                      <span className="wp-status">{row.status}</span>
                    </td>
                    <td>
                      <Link href={`/marketing/segments/${row.id}?country=${countryCode}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

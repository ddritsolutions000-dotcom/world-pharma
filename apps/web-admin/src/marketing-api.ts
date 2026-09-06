import { adminJson, AdminHttpError } from './admin-http';

export class MarketingApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'MarketingApiError';
  }
}

async function marketingFetch(token: string, path: string, init?: RequestInit) {
  try {
    return await adminJson(token, path, init);
  } catch (err) {
    if (err instanceof AdminHttpError) {
      throw new MarketingApiError(err.message, err.status);
    }
    throw new MarketingApiError('request_failed', 0);
  }
}

export type MarketingSegment = {
  id: string;
  country_code: string;
  code: string;
  name: string;
  status: string;
  rules: unknown;
  version: number;
  preview_count?: number;
};

export type MarketingCampaign = {
  id: string;
  country_code: string;
  code: string;
  name: string;
  status: string;
  channel: string;
  title: string;
  body: string;
  segment_id: string;
  version: number;
  segment?: { id: string; code: string; name: string };
};

export type CampaignSendRow = {
  id: string;
  person_id: string;
  status: string;
  skip_reason: string | null;
};

export function listMarketingSegments(token: string, countryCode: string) {
  return marketingFetch(token, `/api/v1/admin/marketing/segments?country_code=${encodeURIComponent(countryCode)}`) as Promise<{
    data: MarketingSegment[];
  }>;
}

export function getMarketingSegment(token: string, id: string, countryCode: string) {
  return marketingFetch(
    token,
    `/api/v1/admin/marketing/segments/${id}?country_code=${encodeURIComponent(countryCode)}`,
  ) as Promise<MarketingSegment>;
}

export function listMarketingCampaigns(token: string, countryCode: string) {
  return marketingFetch(token, `/api/v1/admin/marketing/campaigns?country_code=${encodeURIComponent(countryCode)}`) as Promise<{
    data: MarketingCampaign[];
  }>;
}

export function getMarketingCampaign(token: string, id: string, countryCode: string) {
  return marketingFetch(
    token,
    `/api/v1/admin/marketing/campaigns/${id}?country_code=${encodeURIComponent(countryCode)}`,
  ) as Promise<MarketingCampaign>;
}

export function listCampaignSends(token: string, campaignId: string, countryCode: string) {
  return marketingFetch(
    token,
    `/api/v1/admin/marketing/campaigns/${campaignId}/sends?country_code=${encodeURIComponent(countryCode)}`,
  ) as Promise<{ data: CampaignSendRow[] }>;
}

export function createMarketingSegment(
  token: string,
  body: {
    country_code: string;
    code: string;
    name: string;
    rules?: unknown;
    status?: string;
  },
) {
  return marketingFetch(token, '/api/v1/admin/marketing/segments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as Promise<MarketingSegment>;
}

export function createMarketingCampaign(
  token: string,
  body: {
    country_code: string;
    code: string;
    name: string;
    segment_id: string;
    title: string;
    body: string;
    channel?: string;
  },
) {
  return marketingFetch(token, '/api/v1/admin/marketing/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as Promise<MarketingCampaign>;
}

export function scheduleCampaign(token: string, campaignId: string, countryCode: string, version: number) {
  return marketingFetch(token, `/api/v1/admin/marketing/campaigns/${campaignId}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ country_code: countryCode, version }),
  }) as Promise<MarketingCampaign>;
}

export function sendCampaign(token: string, campaignId: string, countryCode: string) {
  return marketingFetch(token, `/api/v1/admin/marketing/campaigns/${campaignId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `ui-send-${campaignId}` },
    body: JSON.stringify({ country_code: countryCode }),
  }) as Promise<{ sent_count: number; skipped_count: number }>;
}

export const CAMPAIGN_STATUSES = ['DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'CANCELLED'] as const;

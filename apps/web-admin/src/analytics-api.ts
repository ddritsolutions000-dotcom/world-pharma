const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export class AnalyticsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AnalyticsApiError';
  }
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

function buildQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function analyticsFetch(token: string, path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const detail =
      typeof body.detail === 'string'
        ? body.detail
        : typeof body.message === 'string'
          ? body.message
          : 'request_failed';
    throw new AnalyticsApiError(detail, res.status);
  }
  return body;
}

export type AnalyticsOverviewTotals = {
  order_paid_count: number;
  order_gmv_minor: string;
  checkout_started_count: number;
  cart_abandoned_count: number;
  affiliate_click_count: number;
  appointment_completed_count: number;
  lab_booking_completed_count: number;
  imaging_booking_completed_count: number;
  product_view_count: number;
};

export type AnalyticsOverviewDaily = AnalyticsOverviewTotals & {
  metric_date: string;
};

export type AnalyticsOverviewResponse = {
  country_code: string;
  from: string;
  to: string;
  totals: AnalyticsOverviewTotals;
  daily: AnalyticsOverviewDaily[];
  requested_by: string;
};

export type AnalyticsCommerceItem = {
  metric_date: string;
  catalog_item_id: string;
  view_count: number;
  add_to_cart_count: number;
  purchase_count: number;
};

export type AnalyticsCommerceResponse = {
  country_code: string;
  from: string;
  to: string;
  catalog_item_id: string | null;
  items: AnalyticsCommerceItem[];
  requested_by: string;
};

export type AnalyticsMarketingDaily = {
  metric_date: string;
  campaign_send_count: number;
  marketing_opt_in_count: number;
};

export type AnalyticsMarketingResponse = {
  country_code: string;
  from: string;
  to: string;
  daily: AnalyticsMarketingDaily[];
  requested_by: string;
};

export type AnalyticsQuery = {
  countryCode: string;
  from?: string;
  to?: string;
  catalogItemId?: string;
};

export function fetchAnalyticsOverview(token: string, query: AnalyticsQuery) {
  return analyticsFetch(
    token,
    `/api/v1/admin/analytics/overview${buildQuery({
      country_code: query.countryCode,
      from: query.from,
      to: query.to,
    })}`,
  ) as Promise<AnalyticsOverviewResponse>;
}

export function fetchAnalyticsCommerce(token: string, query: AnalyticsQuery) {
  return analyticsFetch(
    token,
    `/api/v1/admin/analytics/commerce${buildQuery({
      country_code: query.countryCode,
      from: query.from,
      to: query.to,
      catalog_item_id: query.catalogItemId,
    })}`,
  ) as Promise<AnalyticsCommerceResponse>;
}

export function fetchAnalyticsMarketing(token: string, query: AnalyticsQuery) {
  return analyticsFetch(
    token,
    `/api/v1/admin/analytics/marketing${buildQuery({
      country_code: query.countryCode,
      from: query.from,
      to: query.to,
    })}`,
  ) as Promise<AnalyticsMarketingResponse>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export class CrmApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CrmApiError';
  }
}

async function parseJson(res: Response) {
  return res.json().catch(() => ({}));
}

async function crmFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await parseJson(res);
  if (!res.ok) {
    throw new CrmApiError((body.detail as string) ?? 'request_failed', res.status);
  }
  return body;
}

export type CrmCustomerSummary = {
  person_id: string;
  status: string;
  account_status: string | null;
  preferred_locale: string | null;
  country_code: string;
  identifiers: Array<{ type: string; masked_value: string; verified: boolean }>;
};

export type CrmCustomer360 = {
  person_id: string;
  country_code: string;
  profile: CrmCustomerSummary;
  orders: Array<{
    id: string;
    order_number: string;
    status: string;
    total_minor: string;
    currency: string;
    created_at: string;
    has_prescription_link: boolean;
    items: Array<{ id: string; title: string; qty: number; line_minor: string }>;
  }>;
  appointments: Array<{
    id: string;
    status: string;
    type: string;
    starts_at: string;
    ends_at: string;
    specialties: unknown;
  }>;
  lab_bookings: Array<{
    id: string;
    status: string;
    collection_mode: string;
    report_released: boolean;
  }>;
  imaging_bookings: Array<{
    id: string;
    status: string;
    report_released: boolean;
  }>;
  support_tickets: Array<{
    id: string;
    status: string;
    subject: string;
    reference_type: string | null;
    reference_id: string | null;
    queue_code: string;
    created_at: string;
  }>;
  marketing_preferences: {
    marketing_allowed: boolean;
    email_allowed: boolean;
  };
  refill_requests: Array<{ id: string; status: string; created_at: string }>;
};

export function listCrmCustomers(
  token: string,
  params: { country_code: string; q?: string },
) {
  const query = new URLSearchParams({ country_code: params.country_code });
  if (params.q) {
    query.set('q', params.q);
  }
  return crmFetch(token, `/api/v1/admin/crm/customers?${query.toString()}`) as Promise<{
    data: CrmCustomerSummary[];
  }>;
}

export function getCrmCustomer360(token: string, personId: string, countryCode: string) {
  return crmFetch(
    token,
    `/api/v1/admin/crm/customers/${personId}?country_code=${encodeURIComponent(countryCode)}`,
  ) as Promise<CrmCustomer360>;
}

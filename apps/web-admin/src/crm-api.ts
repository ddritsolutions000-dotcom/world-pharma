import { adminJson, AdminHttpError } from './admin-http';

export class CrmApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CrmApiError';
  }
}

async function crmFetch(token: string, path: string, init?: RequestInit) {
  try {
    return await adminJson(token, path, init);
  } catch (err) {
    if (err instanceof AdminHttpError) {
      throw new CrmApiError(err.message, err.status);
    }
    throw new CrmApiError('request_failed', 0);
  }
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
  rx_subscriptions: Array<{
    id: string;
    status: string;
    auto_execute_enabled: boolean;
    created_at: string;
  }>;
  loyalty: Array<{
    program_code: string;
    program_name: string;
    program_status: string;
    points_balance: number;
  }>;
  product_reviews: Array<{
    id: string;
    rating: number;
    status: string;
    catalog_slug: string;
    created_at: string;
  }>;
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

export function listCrmAutomationRuns(token: string, countryCode: string) {
  return crmFetch(
    token,
    `/api/v1/admin/crm/automation-runs?country_code=${encodeURIComponent(countryCode)}`,
  ) as Promise<{
    data: Array<{
      id: string;
      automation_kind: string;
      source_id: string;
      person_id: string;
      status: string;
      skip_reason: string | null;
      created_at: string;
    }>;
  }>;
}

export function evaluateCrmAutomation(token: string, countryCode: string) {
  return crmFetch(token, `/api/v1/admin/crm/automation/evaluate`, {
    method: 'POST',
    body: JSON.stringify({ country_code: countryCode }),
  }) as Promise<unknown>;
}

export function revealCrmIdentifiers(token: string, personId: string, countryCode: string, reason: string) {
  return crmFetch(token, `/api/v1/admin/crm/customers/${encodeURIComponent(personId)}/reveal-identifiers`, {
    method: 'POST',
    body: JSON.stringify({ country_code: countryCode, reason }),
  }) as Promise<{
    person_id: string;
    identifiers: Array<{ type: string; value: string; verified: boolean }>;
    revealed_at: string;
  }>;
}

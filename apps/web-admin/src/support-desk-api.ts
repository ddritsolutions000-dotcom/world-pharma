import { apiBaseUrl } from '@world-pharma/shell-core';

export class SupportDeskApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const SUPPORT_TICKET_STATUSES = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'RESOLVED',
  'CLOSED',
] as const;

export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export type SupportQueue = {
  id: string;
  country_id: string;
  code: string;
  name: string;
  active: boolean;
};

export type SupportTicketSummary = {
  id: string;
  person_id: string;
  country_id: string;
  queue_id: string;
  queue_code: string;
  status: SupportTicketStatus;
  subject: string;
  reference_type: string | null;
  reference_id: string | null;
  assignee_person_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportTicketMessage = {
  id: string;
  visibility: 'CUSTOMER' | 'INTERNAL';
  author_person_id: string;
  created_at: string;
  body: string;
};

export type SupportTicketDetail = SupportTicketSummary & {
  queue_name: string;
  messages: SupportTicketMessage[];
};

/** UX helper mirroring server transition table — server remains authoritative. */
export const ALLOWED_STATUS_TRANSITIONS: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  OPEN: ['ASSIGNED', 'CLOSED'],
  ASSIGNED: ['IN_PROGRESS', 'OPEN'],
  IN_PROGRESS: ['WAITING_CUSTOMER', 'RESOLVED', 'CLOSED'],
  WAITING_CUSTOMER: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
};

export function isTerminalTicketStatus(status: string): boolean {
  return status === 'CLOSED';
}

export function allowedNextStatuses(status: string): SupportTicketStatus[] {
  if (!SUPPORT_TICKET_STATUSES.includes(status as SupportTicketStatus)) {
    return [];
  }
  return ALLOWED_STATUS_TRANSITIONS[status as SupportTicketStatus];
}

export async function supportDeskCall<T = unknown>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const base = apiBaseUrl(typeof process === 'undefined' ? {} : process.env);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new SupportDeskApiError('network_error', 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new SupportDeskApiError((body as { detail?: string }).detail ?? 'request_failed', res.status);
  }
  return body as T;
}

export function listSupportQueues(token: string, countryCode: string) {
  return supportDeskCall<{ data: SupportQueue[] }>(
    `/api/v1/admin/support/queues?country_code=${encodeURIComponent(countryCode)}`,
    token,
  );
}

export function listSupportTickets(
  token: string,
  query: { country_code: string; status?: string; queue_id?: string },
) {
  const params = new URLSearchParams({ country_code: query.country_code });
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.queue_id) {
    params.set('queue_id', query.queue_id);
  }
  return supportDeskCall<{ data: SupportTicketSummary[] }>(
    `/api/v1/admin/support/tickets?${params}`,
    token,
  );
}

export function getSupportTicket(token: string, ticketId: string, countryCode: string) {
  return supportDeskCall<SupportTicketDetail>(
    `/api/v1/admin/support/tickets/${encodeURIComponent(ticketId)}?country_code=${encodeURIComponent(countryCode)}`,
    token,
  );
}

export function assignSupportTicket(
  token: string,
  ticketId: string,
  body: { assignee_person_id: string; country_code: string; idempotency_key?: string },
) {
  return supportDeskCall<SupportTicketDetail>(
    `/api/v1/admin/support/tickets/${encodeURIComponent(ticketId)}/assign`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers: body.idempotency_key ? { 'Idempotency-Key': body.idempotency_key } : undefined,
    },
  );
}

export function setSupportTicketStatus(
  token: string,
  ticketId: string,
  body: { status: string; country_code: string; idempotency_key?: string },
) {
  return supportDeskCall<SupportTicketDetail>(
    `/api/v1/admin/support/tickets/${encodeURIComponent(ticketId)}/status`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers: body.idempotency_key ? { 'Idempotency-Key': body.idempotency_key } : undefined,
    },
  );
}

export function addSupportTicketMessage(
  token: string,
  ticketId: string,
  body: {
    body: string;
    visibility: 'CUSTOMER' | 'INTERNAL';
    country_code: string;
    idempotency_key?: string;
  },
) {
  return supportDeskCall<SupportTicketDetail>(
    `/api/v1/admin/support/tickets/${encodeURIComponent(ticketId)}/messages`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers: body.idempotency_key ? { 'Idempotency-Key': body.idempotency_key } : undefined,
    },
  );
}

export function escalateSupportTicket(
  token: string,
  ticketId: string,
  body: { queue_id: string; country_code: string },
) {
  return supportDeskCall<SupportTicketDetail>(
    `/api/v1/admin/support/tickets/${encodeURIComponent(ticketId)}/escalate`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

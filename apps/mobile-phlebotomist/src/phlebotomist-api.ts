import { apiFetch } from '@world-pharma/shell-core';

export class PhlebotomistApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type CollectionJob = {
  id: string;
  status: string;
  coc_status: string | null;
  collection_mode: string | null;
  test_title: string;
  customer_display: string;
  city: string | null;
  line1_masked: string | null;
  container_barcode: string | null;
  assignee_id: string | null;
  is_mine: boolean;
  note?: string;
};

async function call<T>(path: string, token: string, init: Parameters<typeof apiFetch>[1] = {}): Promise<T> {
  const res = await apiFetch(path, { ...init, accessToken: token });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PhlebotomistApiError((body as { detail?: string }).detail ?? 'request_failed', res.status);
  }
  return body as T;
}

export function listJobs(token: string) {
  return call<{ data: CollectionJob[] }>('api/v1/phlebotomist/jobs', token);
}

export function getJob(token: string, jobId: string) {
  return call<CollectionJob>(`api/v1/phlebotomist/jobs/${jobId}`, token);
}

export function acceptJob(token: string, jobId: string) {
  return call(`api/v1/phlebotomist/jobs/${jobId}/accept`, token, { method: 'POST' });
}

export function arriveJob(token: string, jobId: string) {
  return call(`api/v1/phlebotomist/jobs/${jobId}/arrive`, token, { method: 'POST', body: '{}' });
}

export function verifyJob(token: string, jobId: string) {
  return call(`api/v1/phlebotomist/jobs/${jobId}/verify`, token, { method: 'POST', body: '{}' });
}

export function collectJob(token: string, jobId: string) {
  return call(`api/v1/phlebotomist/jobs/${jobId}/collect`, token, { method: 'POST', body: '{}' });
}

export function sealJob(token: string, jobId: string, containerBarcode: string) {
  return call(`api/v1/phlebotomist/jobs/${jobId}/seal`, token, {
    method: 'POST',
    body: JSON.stringify({ container_barcode: containerBarcode }),
  });
}

export function handoverJob(token: string, jobId: string) {
  return call(`api/v1/phlebotomist/jobs/${jobId}/handover`, token, { method: 'POST', body: '{}' });
}

export function failJob(token: string, jobId: string, exceptionCode: string) {
  return call(`api/v1/phlebotomist/jobs/${jobId}/fail`, token, {
    method: 'POST',
    body: JSON.stringify({ exception_code: exceptionCode }),
  });
}

export type PhlebotomistSupportTicket = {
  id: string;
  subject: string;
  status: string;
};

export function fetchPhlebotomistSupportTickets(token: string) {
  return call<{ data: PhlebotomistSupportTicket[] }>('api/v1/support/tickets', token);
}

export function createPhlebotomistSupportTicket(token: string, input: { subject: string; body: string }) {
  return call('api/v1/support/tickets', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type PhlebotomistInboxItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
};

export function fetchPhlebotomistInbox(token: string) {
  return call<{ data: PhlebotomistInboxItem[] }>('api/v1/me/notifications/inbox', token);
}

export function markPhlebotomistInboxRead(token: string, id: string) {
  return call(`api/v1/me/notifications/inbox/${id}/read`, token, { method: 'POST' });
}

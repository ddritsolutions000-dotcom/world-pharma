import { apiFetch } from '@world-pharma/shell-core';

export class DeliveryApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type DeliveryJob = {
  id: string;
  status: string;
  job_type?: string;
  tracking_number: string | null;
  shipment_status: string | null;
  assignee_id: string | null;
  test_title?: string;
  parcel_label?: string;
  note?: string;
  dropoff: { city: string | null; region: string | null; recipient: string | null };
};

async function call<T>(path: string, token: string, init: Parameters<typeof apiFetch>[1] = {}): Promise<T> {
  const res = await apiFetch(path, { ...init, accessToken: token });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new DeliveryApiError((body as { detail?: string }).detail ?? 'request_failed', res.status);
  }
  return body as T;
}

export function setPresence(token: string, online: boolean) {
  return call('api/v1/delivery/presence', token, {
    method: 'POST',
    body: JSON.stringify({ online }),
  });
}

export function listJobs(token: string) {
  return call<{ data: DeliveryJob[] }>('api/v1/delivery/jobs', token);
}

export function getJob(token: string, jobId: string) {
  return call<DeliveryJob>(`api/v1/delivery/jobs/${jobId}`, token);
}

export function acceptJob(token: string, jobId: string) {
  return call(`api/v1/delivery/jobs/${jobId}/accept`, token, { method: 'POST' });
}

export function arriveJob(token: string, jobId: string) {
  return call(`api/v1/delivery/jobs/${jobId}/arrive`, token, { method: 'POST' });
}

export function pickupJob(token: string, jobId: string) {
  return call(`api/v1/delivery/jobs/${jobId}/pickup`, token, { method: 'POST' });
}

export function deliverSampleJob(token: string, jobId: string) {
  return call(`api/v1/delivery/jobs/${jobId}/deliver`, token, { method: 'POST' });
}

export function verifyPod(token: string, jobId: string, code: string) {
  return call(`api/v1/delivery/jobs/${jobId}/pod`, token, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export function failJob(token: string, jobId: string, reason: string) {
  return call(`api/v1/delivery/jobs/${jobId}/fail`, token, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function rtoJob(token: string, jobId: string) {
  return call(`api/v1/delivery/jobs/${jobId}/rto`, token, { method: 'POST' });
}

export type DeliverySupportTicket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  reference_type?: string;
  reference_id?: string;
  created_at: string;
  category?: string;
  note?: string;
};

export function fetchDeliverySupportTickets(token: string) {
  return call<{ data: DeliverySupportTicket[] }>('api/v1/delivery/support/tickets', token);
}

export function createDeliverySupportTicket(
  token: string,
  body: {
    subject: string;
    body: string;
    reference_type?: string;
    reference_id?: string;
  },
) {
  return call<DeliverySupportTicket>('api/v1/delivery/support/tickets', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

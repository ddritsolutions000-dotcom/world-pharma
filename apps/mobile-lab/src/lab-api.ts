import { apiFetch } from '@world-pharma/shell-core';

export class LabApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, token: string, init: Parameters<typeof apiFetch>[1] = {}): Promise<T> {
  const res = await apiFetch(path, { ...init, accessToken: token });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new LabApiError((body as { detail?: string }).detail ?? 'request_failed', res.status);
  }
  return body as T;
}

export type LabOrganization = {
  id: string;
  display_name: string;
  legal_name: string;
};

export type LabAccessionRow = {
  id: string;
  lab_sample_id: string;
  accession_number: string;
  sample_status: string;
  test_title: string;
  processing_status: string | null;
};

export type LabCollectionRow = {
  id: string;
  status: string;
  test_title: string;
  collection_mode?: string;
  slot_starts_at?: string | null;
  assignee_person_id?: string | null;
  container_barcode?: string | null;
};

export type LabStaffBooking = {
  id: string;
  status: string;
  collection_mode: string;
  currency: string;
  total_minor: string;
  slot_starts_at: string | null;
  lines: Array<{ id: string; title: string; qty: number }>;
};

export type LabTransportRow = {
  id: string;
  status: string;
  coc_status: string | null;
  container_barcode: string | null;
  test_title: string;
  lab_sample_id: string | null;
};

export type LabProcessingRow = {
  id: string;
  accession_number: string;
  status: string;
  test_title: string;
  container_barcode: string | null;
};

export type LabSupportTicket = {
  id: string;
  subject: string;
  status: string;
};

export type LabPathologyRow = {
  id: string;
  accession_number: string;
  test_title: string;
  status: string | null;
  version_number: number | null;
};

export type LabInboxItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
};

export function fetchLabOrganizations(token: string) {
  return call<{ data: LabOrganization[] }>('api/v1/lab/organizations', token);
}

export function fetchLabAccessions(token: string, labOrgId: string) {
  return call<{ data: LabAccessionRow[] }>(
    `api/v1/lab/accessions?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function fetchLabCollections(token: string, labOrgId: string) {
  return call<{ data: LabCollectionRow[] }>(
    `api/v1/lab/collections?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function fetchLabStaffBookings(token: string, labOrgId: string) {
  return call<{ data: LabStaffBooking[] }>(
    `api/v1/lab/bookings?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function fetchLabTransport(token: string, labOrgId: string) {
  return call<{ data: LabTransportRow[] }>(
    `api/v1/lab/transport?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function receiveLabSample(token: string, labOrgId: string, sampleId: string, idempotencyKey: string) {
  return call(`api/v1/lab/samples/${sampleId}/receive`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId, idempotency_key: idempotencyKey }),
  });
}

export function accessionLabSample(token: string, labOrgId: string, labSampleId: string, idempotencyKey: string) {
  return call('api/v1/lab/accessions', token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId, lab_sample_id: labSampleId, idempotency_key: idempotencyKey }),
  });
}

export function fetchLabProcessing(token: string, labOrgId: string) {
  return call<{ data: LabProcessingRow[] }>(
    `api/v1/lab/processing?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function startLabProcessing(token: string, labOrgId: string, processingId: string) {
  return call(`api/v1/lab/processing/${processingId}/start`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId }),
  });
}

export function completeLabProcessing(token: string, labOrgId: string, processingId: string) {
  return call(`api/v1/lab/processing/${processingId}/complete`, token, {
    method: 'POST',
    body: JSON.stringify({ lab_org_id: labOrgId }),
  });
}

export function fetchLabSupportTickets(token: string) {
  return call<{ data: LabSupportTicket[] }>('api/v1/support/tickets', token);
}

export function createLabSupportTicket(token: string, input: { subject: string; body: string }) {
  return call('api/v1/support/tickets', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchLabPathology(token: string, labOrgId: string) {
  return call<{ data: LabPathologyRow[] }>(
    `api/v1/lab/pathology?lab_org_id=${encodeURIComponent(labOrgId)}`,
    token,
  );
}

export function fetchLabInbox(token: string) {
  return call<{ data: LabInboxItem[] }>('api/v1/me/notifications/inbox', token);
}

export function markLabInboxRead(token: string, id: string) {
  return call(`api/v1/me/notifications/inbox/${id}/read`, token, { method: 'POST' });
}

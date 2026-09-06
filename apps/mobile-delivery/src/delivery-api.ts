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
  direction?: 'OUTBOUND' | 'RETURN_PICKUP' | string | null;
  return_request_id?: string | null;
  pickup_slot_start?: string | null;
  pickup_slot_end?: string | null;
  tracking_number: string | null;
  shipment_status: string | null;
  assignee_id: string | null;
  test_title?: string;
  parcel_label?: string | null;
  note?: string;
  pod_photo_captured?: boolean;
  pod_evidence?: { photo?: boolean; signature?: boolean; sandbox?: boolean };
  dropoff: {
    city: string | null;
    region: string | null;
    recipient: string | null;
    line1?: string | null;
    query?: string | null;
  };
  pickup?: {
    label?: string;
    query?: string | null;
    city?: string | null;
    region?: string | null;
    recipient?: string | null;
    line1?: string | null;
  };
};

async function call<T>(path: string, token: string, init: Parameters<typeof apiFetch>[1] = {}): Promise<T> {
  const res = await apiFetch(path, { ...init, accessToken: token });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new DeliveryApiError((body as { detail?: string }).detail ?? 'request_failed', res.status);
  }
  return body as T;
}

export function setPresence(
  token: string,
  online: boolean,
  coords?: { latitude?: number; longitude?: number },
) {
  return call('api/v1/delivery/presence', token, {
    method: 'POST',
    body: JSON.stringify({
      online,
      ...(coords?.latitude != null && coords?.longitude != null
        ? { latitude: coords.latitude, longitude: coords.longitude }
        : {}),
    }),
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

type Gps = { latitude?: number; longitude?: number; accuracy_meters?: number };

export function arriveJob(token: string, jobId: string, location?: Gps) {
  return call(`api/v1/delivery/jobs/${jobId}/arrive`, token, {
    method: 'POST',
    body: JSON.stringify(location ?? {}),
  });
}

export function pickupJob(token: string, jobId: string, location?: Gps) {
  return call(`api/v1/delivery/jobs/${jobId}/pickup`, token, {
    method: 'POST',
    body: JSON.stringify(location ?? {}),
  });
}

export function deliverSampleJob(token: string, jobId: string, location?: Gps) {
  return call(`api/v1/delivery/jobs/${jobId}/deliver`, token, {
    method: 'POST',
    body: JSON.stringify(location ?? {}),
  });
}

export function verifyPod(
  token: string,
  jobId: string,
  code: string,
  photoUri?: string | null,
  location?: { latitude?: number; longitude?: number; accuracy_meters?: number },
) {
  return call(`api/v1/delivery/jobs/${jobId}/pod`, token, {
    method: 'POST',
    body: JSON.stringify(
      photoUri
        ? { code, photo_uri: photoUri, ...location }
        : { code, ...location },
    ),
  });
}

export function uploadPodPhoto(
  token: string,
  jobId: string,
  input: {
    content_base64: string;
    content_type: string;
    idempotency_key?: string;
    latitude?: number;
    longitude?: number;
    accuracy_meters?: number;
  },
) {
  return call(`api/v1/delivery/jobs/${jobId}/pod/photo`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function uploadPodSignature(
  token: string,
  jobId: string,
  input: {
    content_base64: string;
    content_type: string;
    idempotency_key?: string;
  },
) {
  return call(`api/v1/delivery/jobs/${jobId}/pod/signature`, token, {
    method: 'POST',
    body: JSON.stringify(input),
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

export type DeliveryInboxItem = {
  id: string;
  title: string;
  body: string;
  read: boolean;
};

export function fetchDeliveryInbox(token: string) {
  return call<{ data: DeliveryInboxItem[] }>('api/v1/me/notifications/inbox', token);
}

export function markDeliveryInboxRead(token: string, id: string) {
  return call(`api/v1/me/notifications/inbox/${id}/read`, token, { method: 'POST' });
}

export type PartnerWalletView = {
  available_minor: string;
  held_minor: string;
  lifetime_earned_minor: string;
  lifetime_withdrawn_minor: string;
  currency: string;
  message: string;
  payout_account_required: boolean;
  payout_account: {
    method: string;
    account_holder_name: string;
    bank_name: string | null;
    account_number_masked: string | null;
    ifsc_or_routing: string | null;
    upi_id_masked: string | null;
  } | null;
  ledger: Array<{
    id: string;
    kind: string;
    amount_minor: string;
    currency: string;
    created_at: string;
    note: string | null;
  }>;
  withdraw_requests: Array<{
    id: string;
    status: string;
    amount_minor: string;
    currency: string;
    created_at: string;
  }>;
};

export function fetchPartnerWallet(token: string) {
  return call<PartnerWalletView>('api/v1/partner/wallet?partner_type=DELIVERY', token);
}

export function savePartnerPayoutAccount(
  token: string,
  body: {
    method: 'BANK' | 'UPI';
    account_holder_name: string;
    bank_name?: string;
    account_number?: string;
    ifsc_or_routing?: string;
    upi_id?: string;
  },
) {
  return call('api/v1/partner/wallet/payout-account', token, {
    method: 'POST',
    body: JSON.stringify({ partner_type: 'DELIVERY', ...body }),
  });
}

export function withdrawPartnerWallet(token: string, amount_minor: string) {
  return call<{ status: string; amount_minor: string; currency: string }>(
    'api/v1/partner/wallet/withdraw',
    token,
    {
      method: 'POST',
      body: JSON.stringify({ partner_type: 'DELIVERY', amount_minor }),
    },
  );
}


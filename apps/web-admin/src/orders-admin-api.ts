import { adminApiRoot } from './admin-http';

export type AdminOrderSummary = {
  id: string;
  order_number: string;
  status: string;
  total_minor?: string;
  currency?: string;
  created_at?: string;
};

export type AdminOrderDetail = AdminOrderSummary & {
  items?: Array<{ id: string; sku: string; qty: number; line_minor: string }>;
  history?: Array<{
    to_status?: string;
    toStatus?: string;
    reason?: string | null;
    created_at?: string;
    createdAt?: string;
  }>;
  shipments?: Array<{ id: string; status: string; tracking_number: string | null }>;
  fulfillment?: unknown;
};

export function newOrderIdempotencyKey(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function adminFetch(token: string, path: string, init?: RequestInit) {
  let res: Response;
  try {
    res = await fetch(`${adminApiRoot()}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw Object.assign(new Error('load_failed'), { status: 0 });
  }
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

export async function fetchAdminOrders(token: string) {
  const { res, body } = await adminFetch(token, '/api/v1/admin/orders');
  if (res.status === 403) {
    throw Object.assign(new Error('forbidden'), { status: 403 });
  }
  if (!res.ok) {
    throw Object.assign(new Error('load_failed'), { status: res.status });
  }
  return (body as { data?: AdminOrderSummary[] }).data ?? [];
}

export async function fetchAdminOrder(token: string, id: string) {
  const { res, body } = await adminFetch(token, `/api/v1/admin/orders/${id}`);
  if (res.status === 403) {
    throw Object.assign(new Error('forbidden'), { status: 403 });
  }
  if (!res.ok) {
    throw Object.assign(new Error('load_failed'), { status: res.status });
  }
  return body as AdminOrderDetail;
}

export async function postAdminOrderAction(
  token: string,
  orderId: string,
  action: 'pick/start' | 'pick/complete' | 'pack/start' | 'pack/complete' | 'cancel' | 'refund',
) {
  const needsKey = action === 'cancel';
  const { res, body } = await adminFetch(token, `/api/v1/admin/orders/${orderId}/${action}`, {
    method: 'POST',
    headers: needsKey ? { 'Idempotency-Key': newOrderIdempotencyKey(`order-${action}`) } : undefined,
  });
  if (!res.ok) {
    throw Object.assign(new Error((body as { detail?: string }).detail ?? 'action_failed'), { status: res.status });
  }
  return body as AdminOrderDetail;
}

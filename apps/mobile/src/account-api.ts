import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';

export type CustomerProfile = {
  person_id: string;
  status: string;
  preferred_locale: string | null;
  primary_country_id: string | null;
  identifiers: Array<{ type: string; value: string; verified: boolean }>;
  roles: string[];
  permissions: string[];
  mfa_required: boolean;
  last_login_at: string | null;
};

export type CustomerAddress = {
  id: string;
  recipientName?: string;
  recipient_name?: string;
  city: string;
  line1: string;
  line2?: string | null;
  phone?: string | null;
  region?: string | null;
  postalCode?: string | null;
  postal_code?: string | null;
  isDefault?: boolean;
  is_default?: boolean;
};

export type NotificationPreferences = {
  email_enabled: boolean;
  push_enabled: boolean;
  sms_enabled: boolean;
  order_updates: boolean;
  appointment_updates: boolean;
  delivery_updates: boolean;
  marketing: boolean;
};

export type SupportTicket = {
  id: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type TokenOpts = {
  token: string;
  onUnauthorized?: () => void;
};

function call<T>(
  path: string,
  opts: TokenOpts & { method?: string; body?: unknown },
): Promise<ApiCallResult<T>> {
  return apiCall<T>(path, {
    method: opts.method,
    token: opts.token,
    body: opts.body,
    onUnauthorized: opts.onUnauthorized,
  });
}

export function fetchProfile(opts: TokenOpts): Promise<ApiCallResult<CustomerProfile>> {
  return call<CustomerProfile>('api/v1/me', opts);
}

export function updateProfile(
  opts: TokenOpts & { preferred_locale?: string; primary_country_id?: string | null },
): Promise<ApiCallResult<CustomerProfile>> {
  const { token, onUnauthorized, preferred_locale, primary_country_id } = opts;
  return call<CustomerProfile>('api/v1/me/profile', {
    token,
    onUnauthorized,
    method: 'PATCH',
    body: { preferred_locale, primary_country_id },
  });
}

export function fetchAddresses(opts: TokenOpts): Promise<ApiCallResult<CustomerAddress[]>> {
  return call<CustomerAddress[]>('api/v1/me/addresses', opts);
}

export function createAddress(
  opts: TokenOpts & {
    country_code: string;
    recipient_name: string;
    city: string;
    line1: string;
    phone?: string;
    region?: string;
    postal_code?: string;
    line2?: string;
    is_default?: boolean;
  },
): Promise<ApiCallResult<CustomerAddress>> {
  const { token, onUnauthorized, ...body } = opts;
  return call<CustomerAddress>('api/v1/me/addresses', {
    token,
    onUnauthorized,
    method: 'POST',
    body,
  });
}

export function patchAddress(
  opts: TokenOpts & {
    id: string;
    recipient_name?: string;
    phone?: string;
    region?: string;
    city?: string;
    postal_code?: string;
    line1?: string;
    line2?: string;
    is_default?: boolean;
  },
): Promise<ApiCallResult<CustomerAddress>> {
  const { token, onUnauthorized, id, ...body } = opts;
  return call<CustomerAddress>(`api/v1/me/addresses/${id}`, {
    token,
    onUnauthorized,
    method: 'PATCH',
    body,
  });
}

export function deleteAddress(
  opts: TokenOpts & { id: string },
): Promise<ApiCallResult<{ ok: boolean }>> {
  const { token, onUnauthorized, id } = opts;
  return call<{ ok: boolean }>(`api/v1/me/addresses/${id}`, {
    token,
    onUnauthorized,
    method: 'DELETE',
  });
}

export function fetchNotificationPreferences(
  opts: TokenOpts,
): Promise<ApiCallResult<NotificationPreferences>> {
  return call<NotificationPreferences>('api/v1/me/notifications/preferences', opts);
}

export function updateNotificationPreferences(
  opts: TokenOpts & Partial<NotificationPreferences>,
): Promise<ApiCallResult<NotificationPreferences>> {
  const { token, onUnauthorized, ...body } = opts;
  return call<NotificationPreferences>('api/v1/me/notifications/preferences', {
    token,
    onUnauthorized,
    method: 'PATCH',
    body,
  });
}

export function fetchSupportTickets(
  opts: TokenOpts,
): Promise<ApiCallResult<{ data: SupportTicket[] }>> {
  return call<{ data: SupportTicket[] }>('api/v1/support/tickets', opts);
}

export function createSupportTicket(
  opts: TokenOpts & { subject: string; body: string; reference_type?: string; reference_id?: string },
): Promise<ApiCallResult<SupportTicket>> {
  const { token, onUnauthorized, subject, body, reference_type, reference_id } = opts;
  return call<SupportTicket>('api/v1/support/tickets', {
    token,
    onUnauthorized,
    method: 'POST',
    body: { subject, body, reference_type, reference_id },
  });
}

export function logoutAllSessions(opts: TokenOpts): Promise<ApiCallResult<{ ok: boolean }>> {
  return call<{ ok: boolean }>('api/v1/auth/logout-all', {
    token: opts.token,
    onUnauthorized: opts.onUnauthorized,
    method: 'POST',
  });
}

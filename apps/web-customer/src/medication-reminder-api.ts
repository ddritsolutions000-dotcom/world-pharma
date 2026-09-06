import { apiBaseUrl } from '@world-pharma/shell-core';
import type { MedicationReminder, MedicationReminderInput } from './medication-reminder-ui';

const base = () => apiBaseUrl(typeof process === 'undefined' ? {} : process.env);

async function call(path: string, init: RequestInit & { token?: string | null } = {}) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (init.token) {
    headers.set('Authorization', `Bearer ${init.token}`);
  }
  const { token, ...rest } = init;
  void token;
  const res = await fetch(`${base()}${path}`, { ...rest, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error((body as { detail?: string }).detail ?? 'request_failed'), {
      status: res.status,
    });
  }
  return body;
}

export function fetchMedicationReminders(token: string, countryCode: string) {
  return call(`/api/v1/me/medication-reminders?country_code=${encodeURIComponent(countryCode)}`, {
    token,
  }) as Promise<{ reminders: MedicationReminder[] }>;
}

export function createMedicationReminder(
  token: string,
  countryCode: string,
  input: MedicationReminderInput,
) {
  return call('/api/v1/me/medication-reminders', {
    method: 'POST',
    token,
    body: JSON.stringify({ country_code: countryCode, ...input }),
  }) as Promise<MedicationReminder>;
}

export function updateMedicationReminder(
  token: string,
  id: string,
  input: Partial<MedicationReminderInput>,
) {
  return call(`/api/v1/me/medication-reminders/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(input),
  }) as Promise<MedicationReminder>;
}

export function deleteMedicationReminder(token: string, id: string) {
  return call(`/api/v1/me/medication-reminders/${id}`, {
    method: 'DELETE',
    token,
  }) as Promise<{ removed: boolean; id: string }>;
}

export type ReminderBuyAgain = {
  reminder_id: string;
  medicine_label: string;
  schedule_times: string[];
  eligible: boolean;
  offer_id?: string;
  product_slug?: string | null;
  last_order_id?: string;
  qty?: number;
  rx_required?: boolean;
  reason_code?: string;
  reason?: string;
};

export function fetchReminderBuyAgain(token: string, reminderId: string, countryCode: string) {
  return call(
    `/api/v1/me/medication-reminders/${reminderId}/buy-again?country_code=${encodeURIComponent(countryCode)}`,
    { token },
  ) as Promise<ReminderBuyAgain>;
}

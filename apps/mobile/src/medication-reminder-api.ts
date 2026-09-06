import { apiCall, type ApiCallResult } from '@world-pharma/shell-core';
import type { MedicationReminder, MedicationReminderInput } from './medication-reminder-ui';

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

export function fetchMedicationReminders(opts: TokenOpts & { country: string }) {
  return call<{ reminders: MedicationReminder[] }>(
    `api/v1/me/medication-reminders?country_code=${encodeURIComponent(opts.country)}`,
    opts,
  );
}

export function createMedicationReminder(
  opts: TokenOpts & { country: string; input: MedicationReminderInput },
) {
  return call<MedicationReminder>('api/v1/me/medication-reminders', {
    ...opts,
    method: 'POST',
    body: { country_code: opts.country, ...opts.input },
  });
}

export function updateMedicationReminder(
  opts: TokenOpts & { id: string; input: Partial<MedicationReminderInput> },
) {
  const { id, ...rest } = opts;
  return call<MedicationReminder>(`api/v1/me/medication-reminders/${id}`, {
    ...rest,
    method: 'PATCH',
    body: opts.input,
  });
}

export function deleteMedicationReminder(opts: TokenOpts & { id: string }) {
  const { id, ...rest } = opts;
  return call<{ removed: boolean; id: string }>(`api/v1/me/medication-reminders/${id}`, {
    ...rest,
    method: 'DELETE',
  });
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

export function fetchReminderBuyAgain(opts: TokenOpts & { id: string; country: string }) {
  return call<ReminderBuyAgain>(
    `api/v1/me/medication-reminders/${opts.id}/buy-again?country_code=${encodeURIComponent(opts.country)}`,
    opts,
  );
}

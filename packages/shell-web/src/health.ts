import { apiFetch } from '@world-pharma/shell-core';

export async function readApiHealth(): Promise<{ ok: boolean }> {
  try {
    const res = await apiFetch('/health');
    if (!res.ok) {
      return { ok: false };
    }
    const body = (await res.json()) as { status?: string };
    return { ok: body.status === 'ok' };
  } catch {
    return { ok: false };
  }
}

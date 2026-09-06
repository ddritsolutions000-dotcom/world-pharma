export type SearchJobRow = {
  id: string;
  index_kind: string;
  status: string;
  source_type: string;
  source_id: string;
  locale: string;
  attempts: number;
  last_error: string;
  created_at: string;
};

function pick(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
}

export function presentSearchJobs(body: unknown): SearchJobRow[] {
  const rows = Array.isArray((body as { data?: unknown }).data)
    ? ((body as { data: unknown[] }).data)
    : Array.isArray(body)
      ? body
      : [];
  return rows.map((raw, index) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const created = row.createdAt ?? row.created_at;
    return {
      id: pick(row, 'id') || `job-${index}`,
      index_kind: pick(row, 'indexKind', 'index_kind'),
      status: pick(row, 'status') || 'UNKNOWN',
      source_type: pick(row, 'sourceType', 'source_type'),
      source_id: pick(row, 'sourceId', 'source_id'),
      locale: pick(row, 'locale') || 'en',
      attempts: Number(row.attempts ?? 0) || 0,
      last_error: pick(row, 'lastError', 'last_error'),
      created_at: created instanceof Date ? created.toISOString() : typeof created === 'string' ? created : '',
    };
  });
}

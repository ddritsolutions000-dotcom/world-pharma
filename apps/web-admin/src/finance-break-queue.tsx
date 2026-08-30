'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button, Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';
import {
  BREAK_SOURCE_KINDS,
  BREAK_WORKFLOW_STATUSES,
  closeFinanceBreak,
  fetchFinanceBreakDetail,
  fetchFinanceBreaks,
  investigateFinanceBreak,
  resolveFinanceBreak,
  type FinanceBreakListQuery,
  type FinanceBreakRow,
} from './finance-admin-api';

const PAGE_SIZE = 5;

export type BreakQueuePanelProps = {
  getAccessToken: () => string | null;
  canReconcile: boolean;
  onForbidden: () => void;
};

function matchesRefSearch(row: FinanceBreakRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const haystack = [
    row.id,
    row.source_ref,
    row.internal_ref,
    row.external_ref,
    row.detail,
    row.break_type,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function BreakQueuePanel({ getAccessToken, canReconcile, onForbidden }: BreakQueuePanelProps) {
  const [filters, setFilters] = useState<FinanceBreakListQuery>({ limit: 100 });
  const [refSearch, setRefSearch] = useState('');
  const [breaks, setBreaks] = useState<FinanceBreakRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FinanceBreakRow | null>(null);
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredBreaks = useMemo(
    () => breaks.filter((row) => matchesRefSearch(row, refSearch)),
    [breaks, refSearch],
  );

  const pageCount = Math.max(1, Math.ceil(filteredBreaks.length / PAGE_SIZE));
  const pageRows = filteredBreaks.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const loadDetail = useCallback(
    async (breakId: string) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setDetailLoading(true);
      setDetailError(null);
      const res = await fetchFinanceBreakDetail(token, breakId);
      setDetailLoading(false);
      if (res.status === 403) {
        onForbidden();
        return;
      }
      if (res.status === 404) {
        setDetailError('Break not found or outside your country scope.');
        setDetail(null);
        return;
      }
      if (!res.ok) {
        setDetailError('Break detail could not be loaded.');
        setDetail(null);
        return;
      }
      setDetail((await res.json()) as FinanceBreakRow);
    },
    [getAccessToken, onForbidden],
  );

  async function loadBreaks() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setListError(null);
    setActionError(null);
    const res = await fetchFinanceBreaks(token, filters);
    setLoading(false);
    if (res.status === 403) {
      onForbidden();
      return;
    }
    if (!res.ok) {
      setListError('Finance breaks could not be loaded.');
      setBreaks([]);
      setLoaded(true);
      return;
    }
    const body = (await res.json()) as { data: FinanceBreakRow[] };
    setBreaks(body.data);
    setPage(0);
    setLoaded(true);
    if (selectedId && !body.data.some((row) => row.id === selectedId)) {
      setSelectedId(null);
      setDetail(null);
    }
  }

  async function selectBreak(breakId: string) {
    setSelectedId(breakId);
    setActionError(null);
    await loadDetail(breakId);
  }

  async function runBreakAction(action: 'investigate' | 'resolve' | 'close') {
    if (!selectedId || !canReconcile) {
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setActionLoading(true);
    setActionError(null);
    const key = `${action}-${selectedId}-${Date.now()}`;
    const note = `admin ui ${action}`;
    const res =
      action === 'investigate'
        ? await investigateFinanceBreak(token, selectedId, key, note)
        : action === 'resolve'
          ? await resolveFinanceBreak(token, selectedId, key, note)
          : await closeFinanceBreak(token, selectedId, key, note);
    setActionLoading(false);
    if (res.status === 403) {
      onForbidden();
      return;
    }
    if (!res.ok) {
      const body = (await res.json()) as { detail?: string };
      setActionError(body.detail ?? `Break ${action} failed.`);
      return;
    }
    const updated = (await res.json()) as FinanceBreakRow;
    setDetail(updated);
    setBreaks((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
    await loadBreaks();
    if (selectedId) {
      await loadDetail(selectedId);
    }
  }

  function updateFilter<K extends keyof FinanceBreakListQuery>(key: K, value: FinanceBreakListQuery[K]) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }

  const showInvestigate = detail?.workflow_status === 'OPEN' && canReconcile;
  const showResolve = detail?.workflow_status === 'INVESTIGATING' && canReconcile;
  const showClose = detail?.workflow_status === 'RESOLVED' && canReconcile;

  return (
    <Card>
      <Heading level={3}>Reconciliation break queue</Heading>
      <Text tone="secondary">
        Unified OPEN → INVESTIGATING → RESOLVED → CLOSED workflow. Backend authoritative; sandbox only.
      </Text>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(10rem, 1fr))',
          gap: '0.5rem',
          marginTop: '0.75rem',
          marginBottom: '0.75rem',
        }}
      >
        <label>
          Status
          <select
            value={filters.workflow_status ?? ''}
            onChange={(e) => updateFilter('workflow_status', e.target.value || undefined)}
          >
            <option value="">Active (excl. closed)</option>
            {BREAK_WORKFLOW_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source
          <select
            value={filters.source_kind ?? ''}
            onChange={(e) => updateFilter('source_kind', e.target.value || undefined)}
          >
            <option value="">All sources</option>
            {BREAK_SOURCE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label>
          Classification
          <input
            placeholder="e.g. UNMATCHED"
            value={filters.classification ?? ''}
            onChange={(e) => updateFilter('classification', e.target.value || undefined)}
          />
        </label>
        <label>
          Country ID
          <input
            placeholder="UUID"
            value={filters.country_id ?? ''}
            onChange={(e) => updateFilter('country_id', e.target.value || undefined)}
          />
        </label>
        <label>
          Reference search
          <input
            placeholder="ID / ref / detail"
            value={refSearch}
            onChange={(e) => {
              setRefSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'end', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={Boolean(filters.include_closed)}
            onChange={(e) => updateFilter('include_closed', e.target.checked || undefined)}
          />
          Include closed
        </label>
      </div>

      <Button onClick={() => void loadBreaks()} disabled={loading}>
        {loading ? 'Loading breaks…' : 'Load break queue'}
      </Button>

      {listError ? <Text>{listError}</Text> : null}

      {loading ? <Text>Loading break queue…</Text> : null}

      {loaded && !loading && filteredBreaks.length === 0 ? (
        <EmptyState title="No breaks" description="No reconciliation breaks match the current filters." />
      ) : null}

      {pageRows.length ? (
        <div style={{ marginTop: '1rem' }}>
          <Text tone="secondary">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredBreaks.length)} of{' '}
            {filteredBreaks.length}
          </Text>
          {pageRows.map((row) => (
            <div
              key={row.id}
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem',
                border: selectedId === row.id ? '2px solid var(--color-border-strong, #333)' : '1px solid #ccc',
                cursor: 'pointer',
              }}
              onClick={() => void selectBreak(row.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  void selectBreak(row.id);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <Text>
                {row.workflow_status} · {row.classification ?? row.break_type} · {row.source_kind ?? row.domain}
              </Text>
              <Text tone="secondary">{row.detail}</Text>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <Button disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Previous
            </Button>
            <Text>
              Page {page + 1} / {pageCount}
            </Text>
            <Button disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}

      {selectedId ? (
        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #ccc' }}>
          <Heading level={3}>Break detail</Heading>
          {detailLoading ? <Text>Loading detail…</Text> : null}
          {detailError ? <Text>{detailError}</Text> : null}
          {detail ? (
            <>
              <Text>ID: {detail.id}</Text>
              <Text>
                Status: {detail.workflow_status} · {detail.classification ?? detail.break_type}
              </Text>
              <Text>
                Source: {detail.source_kind ?? detail.domain}
                {detail.source_ref ? ` · ref ${detail.source_ref}` : ''}
              </Text>
              <Text>Country: {detail.country_id ?? '—'}</Text>
              {detail.amount_minor ? (
                <Text>
                  Amount: {detail.amount_minor} {detail.currency}
                </Text>
              ) : null}
              <Text tone="secondary">{detail.detail}</Text>
              <Text tone="secondary">
                Created {detail.created_at} · Updated {detail.updated_at}
              </Text>
              {detail.investigated_at ? (
                <Text tone="secondary">Investigated {detail.investigated_at}</Text>
              ) : null}
              {detail.resolved_at ? (
                <Text tone="secondary">
                  Resolved {detail.resolved_at}
                  {detail.resolution_note ? ` — ${detail.resolution_note}` : ''}
                </Text>
              ) : null}
              {detail.closed_at ? (
                <Text tone="secondary">
                  Closed {detail.closed_at}
                  {detail.close_note ? ` — ${detail.close_note}` : ''}
                </Text>
              ) : null}

              {detail.actions?.length ? (
                <div style={{ marginTop: '1rem' }}>
                  <Text tone="secondary">Action history</Text>
                  {detail.actions.map((action) => (
                    <div key={action.id} style={{ marginBottom: '0.5rem' }}>
                      <Text>
                        {action.action} · {action.created_at}
                      </Text>
                      <Text tone="secondary">
                        {action.actor_person_id ? `by ${action.actor_person_id}` : 'system'}
                        {action.note ? ` — ${action.note}` : ''}
                      </Text>
                    </div>
                  ))}
                </div>
              ) : (
                <Text tone="secondary">No workflow actions recorded yet.</Text>
              )}

              {actionError ? <Text>{actionError}</Text> : null}
              {!canReconcile ? (
                <Text tone="secondary">Requires finance:reconcile to transition breaks.</Text>
              ) : null}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                {showInvestigate ? (
                  <Button disabled={actionLoading} onClick={() => void runBreakAction('investigate')}>
                    Investigate
                  </Button>
                ) : null}
                {showResolve ? (
                  <Button disabled={actionLoading} onClick={() => void runBreakAction('resolve')}>
                    Resolve
                  </Button>
                ) : null}
                {showClose ? (
                  <Button disabled={actionLoading} onClick={() => void runBreakAction('close')}>
                    Close
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

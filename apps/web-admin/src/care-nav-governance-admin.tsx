'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApiRoot, classifyAdminViewState } from './admin-http';
import { AdminViewLoadError } from './admin-request-error';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  ErrorState,
  LoadingState,
  PermissionDeniedState,
  Select,
  Table,
  Text,
} from '@world-pharma/ui-kit/web';
import { MARKET_COUNTRY_CODES, workingCountry } from './working-country';

class AdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function adminCall<T = unknown>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const base = adminApiRoot();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AdminApiError((body as { detail?: string }).detail ?? 'request_failed', res.status);
  }
  return body as T;
}

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

function cell(value: unknown): string {
  if (value == null || value === '') {
    return '—';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '—';
}

export function CareNavGovernance() {
  const { getAccessToken, session } = useSession();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailState, setDetailState] = useState<ViewState>('idle');
  const [overrideAction, setOverrideAction] = useState<'REMATCH' | 'TERMINATE'>('REMATCH');
  const [overrideReason, setOverrideReason] = useState('');
  const [countryCode, setCountryCode] = useState(() => workingCountry(session.countryCode));
  const [confirmOverride, setConfirmOverride] = useState(false);
  const [overrideState, setOverrideState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [overrideMessage, setOverrideMessage] = useState('');

  const loadList = useCallback(
    async (cursor?: string | null) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setViewState('loading');
      try {
        const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const body = await adminCall<{ data?: Record<string, unknown>[]; next_cursor?: string | null }>(
          `/api/v1/admin/care-nav/sessions${qs}`,
          token,
        );
        setRows((prev) => (cursor ? [...prev, ...(body.data ?? [])] : (body.data ?? [])));
        setNextCursor(body.next_cursor ?? null);
        setViewState('idle');
      } catch (err) {
        if (err instanceof AdminApiError) {
          if (err.status === 403) {
            setViewState('forbidden');
            return;
          }
        }
        setViewState(classifyAdminViewState(err));
      }
    },
    [getAccessToken],
  );

  const loadDetail = useCallback(
    async (sessionId: string) => {
      const token = getAccessToken();
      if (!token || !sessionId.trim()) {
        return;
      }
      setDetailState('loading');
      setDetail(null);
      try {
        const body = await adminCall<Record<string, unknown>>(
          `/api/v1/admin/care-nav/sessions/${encodeURIComponent(sessionId.trim())}`,
          token,
        );
        setDetail(body);
        setDetailState('idle');
      } catch (err) {
        if (err instanceof AdminApiError) {
          if (err.status === 403) {
            setDetailState('forbidden');
            return;
          }
          if (err.status === 404) {
            setDetailState('error');
            return;
          }
        }
        setDetailState('network');
      }
    },
    [getAccessToken],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (rows.length && !selectedSessionId) {
      const first = rows[0]?.id;
      if (typeof first === 'string' && first) {
        setSelectedSessionId(first);
      }
    }
  }, [rows, selectedSessionId]);

  const submitOverride = async () => {
    const token = getAccessToken();
    if (!token || !selectedSessionId.trim() || overrideReason.trim().length < 8) {
      return;
    }
    setOverrideState('loading');
    setOverrideMessage('');
    try {
      const body = await adminCall<Record<string, unknown>>(
        `/api/v1/admin/care-nav/sessions/${encodeURIComponent(selectedSessionId.trim())}/override`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            action: overrideAction,
            reason: overrideReason.trim(),
            country_code: countryCode.trim().toUpperCase(),
          }),
        },
      );
      setOverrideState('done');
      setOverrideMessage(`Override ${String(body.action)} applied at ${String(body.created_at)}`);
      setConfirmOverride(false);
      await loadDetail(selectedSessionId);
      await loadList();
    } catch (err) {
      setOverrideState('error');
      setOverrideMessage(err instanceof AdminApiError ? err.message : 'override_failed');
    }
  };

  const tableRows = rows.map((row) => [
    cell(row.id).slice(0, 8),
    cell(row.status),
    cell(row.urgency),
    cell(row.red_flag),
    cell(row.person_id).slice(0, 8),
    cell(row.match_state),
    cell(row.created_at),
  ]);

  return (
    <section className="wp-stack">
      <Heading level={2}>Care navigation governance</Heading>
      <Text tone="secondary">
        Operational audit and clinician override for care navigation sessions. Metadata only — no symptom narrative.
      </Text>
      <Text tone="secondary">Requires care_nav:audit:read (list) and care_nav:override (actions).</Text>

      {viewState === 'loading' && rows.length === 0 ? <LoadingState label="Loading care navigation sessions" /> : null}
      {viewState === 'forbidden' ? <PermissionDeniedState /> : null}
      <AdminViewLoadError viewState={viewState} onRetry={() => void loadList()} />

      {viewState === 'idle' && rows.length === 0 ? (
        <EmptyState
          title="No care navigation sessions"
          description="Sessions appear here after customers start care navigation intake."
        />
      ) : null}

      {rows.length > 0 ? (
        <Table
          caption="Care navigation sessions"
          columns={['ID', 'Status', 'Urgency', 'Red flag', 'Person', 'Match', 'Created']}
          rows={tableRows}
        />
      ) : null}

      {nextCursor ? (
        <Button variant="secondary" onClick={() => void loadList(nextCursor)}>
          Load more
        </Button>
      ) : null}

      <Card>
        <Heading level={3}>Session audit detail</Heading>
        <FormField label="Session">
          {({ id }) => (
            <Select
              id={id}
              value={selectedSessionId}
              onChange={(event) => setSelectedSessionId(event.target.value)}
              disabled={rows.length === 0}
            >
              {rows.length === 0 ? <option value="">No sessions loaded</option> : null}
              {rows.map((row, index) => {
                const sid = typeof row.id === 'string' ? row.id : '';
                return (
                  <option key={sid || `session-${index}`} value={sid}>
                    {cell(row.status)} · {cell(row.urgency)} · {sid.slice(0, 8)}
                  </option>
                );
              })}
            </Select>
          )}
        </FormField>
        <Button variant="secondary" onClick={() => void loadDetail(selectedSessionId)}>
          Load detail
        </Button>

        {detailState === 'loading' ? <LoadingState label="Loading session detail" /> : null}
        {detailState === 'forbidden' ? <PermissionDeniedState /> : null}
        <AdminViewLoadError viewState={detailState} onRetry={() => void loadDetail(selectedSessionId)} />
        {detailState === 'error' ? (
          <Text tone="secondary">Session not found or malformed identifier.</Text>
        ) : null}

        {detail ? (
          <div className="wp-stack">
            <Text tone="secondary">
              Status: {cell(detail.status)} · Urgency: {cell(detail.urgency)} · Red flag: {cell(detail.red_flag)}
            </Text>
            <Text tone="secondary">
              Match set v{cell(detail.match_set_version)} · Recommendations:{' '}
              {Array.isArray(detail.recommendation_ids) ? detail.recommendation_ids.length : 0}
            </Text>
            {Array.isArray(detail.overrides) && detail.overrides.length > 0 ? (
              <Table
                caption="Override history"
                columns={['Action', 'Actor', 'Reason', 'Created']}
                rows={(detail.overrides as Record<string, unknown>[]).map((row) => [
                  cell(row.action),
                  cell(row.actor_person_id).slice(0, 8),
                  cell(row.reason).slice(0, 40),
                  cell(row.created_at),
                ])}
              />
            ) : (
              <Text tone="secondary">No governance overrides recorded.</Text>
            )}
          </div>
        ) : null}
      </Card>

      <Card>
        <Heading level={3}>Clinician override</Heading>
        <Text tone="secondary">
          Override requires explicit reason and confirmation. Red-flag safety cannot be bypassed for customer booking.
        </Text>
        <FormField label="Country">
          {({ id }) => (
            <Select
              id={id}
              value={workingCountry(countryCode)}
              onChange={(event) => setCountryCode(workingCountry(event.target.value))}
            >
              {MARKET_COUNTRY_CODES.map((iso) => (
                <option key={iso} value={iso}>
                  {iso}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Action">
          {({ id }) => (
            <Select
              id={id}
              value={overrideAction}
              onChange={(event) => setOverrideAction(event.target.value as 'REMATCH' | 'TERMINATE')}
            >
              <option value="REMATCH">Rematch providers</option>
              <option value="TERMINATE">Terminate session</option>
            </Select>
          )}
        </FormField>
        <FormField label="Reason (min 8 characters)" hint="Required for audit trail">
          {({ id }) => (
            <Input id={id} value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} />
          )}
        </FormField>
        {!confirmOverride ? (
          <Button
            variant="primary"
            disabled={!selectedSessionId.trim() || overrideReason.trim().length < 8}
            onClick={() => setConfirmOverride(true)}
          >
            Review override
          </Button>
        ) : (
          <div className="wp-stack">
            <Text tone="secondary">
              Confirm {overrideAction} on session {selectedSessionId.slice(0, 8)}… with reason: {overrideReason}
            </Text>
            <Button variant="primary" disabled={overrideState === 'loading'} onClick={() => void submitOverride()}>
              Confirm override
            </Button>
            <Button variant="secondary" onClick={() => setConfirmOverride(false)}>
              Cancel
            </Button>
          </div>
        )}
        {overrideState === 'loading' ? <LoadingState label="Applying override" /> : null}
        {overrideState === 'done' ? <Text tone="secondary">{overrideMessage}</Text> : null}
        {overrideState === 'error' ? (
          <ErrorState
            title="Override failed"
            description={overrideMessage}
            action={{ label: 'Retry', onClick: () => void submitOverride() }}
          />
        ) : null}
      </Card>
    </section>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminViewLoadError } from './admin-request-error';
import { adminApiRoot, classifyAdminViewState } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  ErrorState,
  PermissionDeniedState,
  Select,
  Table,
  Text,
} from '@world-pharma/ui-kit/web';

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

function MetadataListPanel(props: {
  title: string;
  description: string;
  endpoint: string;
  emptyTitle: string;
  emptyDescription: string;
  columns: string[];
  mapRow: (item: Record<string, unknown>) => string[];
  permissionHint: string;
}) {
  const { getAccessToken } = useSession();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState>('idle');

  const load = useCallback(
    async (cursor?: string | null) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setViewState('loading');
      try {
        const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const body = await adminCall<{ data?: Record<string, unknown>[]; next_cursor?: string | null }>(
          `${props.endpoint}${qs}`,
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
          if (err.status === 401) {
            setViewState(classifyAdminViewState(err));
            return;
          }
        }
        setViewState(classifyAdminViewState(err));
      }
    },
    [getAccessToken, props.endpoint],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const tableRows = rows.map(props.mapRow);

  return (
    <section className="wp-stack">
      <Heading level={2}>{props.title}</Heading>
      <Text tone="secondary">{props.description}</Text>
      <Text tone="secondary">Metadata only — no clinical payloads. Requires {props.permissionHint}.</Text>

      {viewState === 'loading' && rows.length === 0 ? <LoadingState label="Loading" /> : null}
      {viewState === 'forbidden' ? <PermissionDeniedState /> : null}
      <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />

      {viewState === 'idle' && rows.length === 0 ? (
        <EmptyState title={props.emptyTitle} description={props.emptyDescription} />
      ) : null}

      {rows.length > 0 ? (
        <Table caption={props.title} columns={props.columns} rows={tableRows} />
      ) : null}

      {nextCursor ? (
        <Button variant="secondary" onClick={() => void load(nextCursor)}>
          Load more
        </Button>
      ) : null}
    </section>
  );
}

export function HealthConsentGovernance() {
  return (
    <MetadataListPanel
      title="Health consent governance"
      description="Audit consent grants including break-glass bridged consents."
      endpoint="/api/v1/admin/health/consent-grants"
      emptyTitle="No consent grants"
      emptyDescription="Consent grants appear here when patients grant access or break-glass is opened."
      permissionHint="clinical:audit:read"
      columns={['ID', 'Purpose', 'Status', 'Subject', 'Recipient', 'Break-glass', 'Granted']}
      mapRow={(row) => [
        cell(row.id).slice(0, 8),
        cell(row.purpose),
        cell(row.status),
        cell(row.subject_person_id).slice(0, 8),
        cell(row.recipient_partner_id).slice(0, 8),
        cell(row.break_glass_grant_id ? 'yes' : 'no'),
        cell(row.granted_at),
      ]}
    />
  );
}

export function HealthAccessAuditsGovernance() {
  return (
    <MetadataListPanel
      title="Health access audits"
      description="Per-artifact payload access evaluation log."
      endpoint="/api/v1/admin/health/access-audits"
      emptyTitle="No access audits"
      emptyDescription="Access attempts are recorded when doctors or patients read health artifacts."
      permissionHint="clinical:audit:read"
      columns={['Time', 'Artifact', 'Patient', 'Doctor', 'Purpose', 'Allowed', 'Reason']}
      mapRow={(row) => [
        cell(row.created_at),
        cell(row.artifact_id).slice(0, 8),
        cell(row.patient_person_id).slice(0, 8),
        cell(row.doctor_partner_id).slice(0, 8),
        cell(row.purpose),
        cell(row.allowed),
        cell(row.reason),
      ]}
    />
  );
}

export function BreakGlassGovernance() {
  const { getAccessToken } = useSession();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [selectedGrantId, setSelectedGrantId] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewState, setReviewState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [confirmReview, setConfirmReview] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await adminCall<{ data?: Record<string, unknown>[] }>(
        '/api/v1/admin/health/break-glass?active_only=true',
        token,
      );
      setRows(body.data ?? []);
      setSelectedGrantId((current) => {
        const ids = (body.data ?? []).map((row) => String(row.id ?? ''));
        return current && ids.includes(current) ? current : ids[0] ?? '';
      });
      setViewState('idle');
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setViewState(classifyAdminViewState(err));
    }
  }, [getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitReview = async () => {
    const token = getAccessToken();
    if (!token || !selectedGrantId.trim()) {
      return;
    }
    setReviewState('loading');
    try {
      await adminCall(`/api/v1/admin/health/break-glass/${selectedGrantId.trim()}/review`, token, {
        method: 'POST',
        body: JSON.stringify({ review_notes: reviewNotes.trim() || undefined }),
      });
      setReviewState('done');
      setConfirmReview(false);
      setReviewNotes('');
      await load();
    } catch {
      setReviewState('error');
    }
  };

  const tableRows = rows.map((row) => [
    cell(row.id).slice(0, 8),
    cell(row.patient_person_id).slice(0, 8),
    cell(row.doctor_partner_id).slice(0, 8),
    cell(row.review_status),
    cell(row.active),
    cell(row.expires_at),
  ]);

  return (
    <section className="wp-stack">
      <Heading level={2}>Break-glass review</Heading>
      <Text tone="secondary">Review active health clinical break-glass grants. Metadata only.</Text>
      <Text tone="secondary">Requires security:break_glass.</Text>

      {viewState === 'loading' ? <LoadingState label="Loading break-glass queue" /> : null}
      {viewState === 'forbidden' ? <PermissionDeniedState /> : null}
      <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />

      {viewState === 'idle' && rows.length === 0 ? (
        <EmptyState title="No active break-glass grants" description="Open grants appear in this queue." />
      ) : null}

      {rows.length > 0 ? (
        <Table
          caption="Break-glass queue"
          columns={['ID', 'Patient', 'Doctor', 'Review', 'Active', 'Expires']}
          rows={tableRows}
        />
      ) : null}

      <Card>
        <Heading level={3}>Mark reviewed</Heading>
        <FormField label="Grant">
          {({ id }) => (
            <Select
              id={id}
              value={selectedGrantId}
              onChange={(e) => setSelectedGrantId(e.target.value)}
              disabled={rows.length === 0}
            >
              {rows.length === 0 ? <option value="">No grants loaded</option> : null}
              {rows.map((row, index) => {
                const gid = String(row.id ?? '');
                return (
                  <option key={gid || `grant-${index}`} value={gid}>
                    {cell(row.review_status)} · {cell(row.patient_person_id).slice(0, 8)} · {gid.slice(0, 8)}
                  </option>
                );
              })}
            </Select>
          )}
        </FormField>
        <FormField label="Review notes (optional)">
          {({ id }) => <Input id={id} value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />}
        </FormField>
        {!confirmReview ? (
          <Button onClick={() => setConfirmReview(true)} disabled={!selectedGrantId.trim()}>
            Review grant
          </Button>
        ) : (
          <div className="wp-stack">
            <Text tone="secondary">Confirm marking this break-glass grant as reviewed?</Text>
            <Button onClick={() => void submitReview()} disabled={reviewState === 'loading'}>
              Confirm review
            </Button>
            <Button variant="secondary" onClick={() => setConfirmReview(false)}>
              Cancel
            </Button>
          </div>
        )}
        {reviewState === 'done' ? <Text tone="secondary">Review recorded.</Text> : null}
        {reviewState === 'error' ? (
          <ErrorState
            title="Could not save review"
            description="Retry the review. This is not a connection problem unless the API is down."
            action={{ label: 'Retry review', onClick: () => void submitReview() }}
          />
        ) : null}
      </Card>
    </section>
  );
}

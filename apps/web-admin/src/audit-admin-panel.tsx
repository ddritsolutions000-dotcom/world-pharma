'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminJson, AdminHttpError, classifyAdminViewState } from './admin-http';
import { AdminViewLoadError } from './admin-request-error';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  PermissionDeniedState,
  Select,
  Table,
  Text,
} from '@world-pharma/ui-kit/web';

type SecurityEvent = Record<string, unknown>;

const EVENT_TYPES = [
  '',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'LOGOUT',
  'PRIVILEGE_DENIED',
  'UNAUTHORIZED_ACCESS_ATTEMPT',
  'APP_AUDIENCE_DENIED',
  'RATE_LIMITED',
  'MFA_ENABLED',
  'MFA_DISABLED',
  'KYC_DECISION',
  'PARTNER_APPROVED',
  'PARTNER_REJECTED',
  'POLICY_CHANGED',
  'CMS_PUBLISHED',
  'PAYMENT_FAILED',
] as const;

function cell(value: unknown): string {
  if (value == null || value === '') {
    return '—';
  }
  return String(value);
}

export function AuditAdminPanel() {
  const { getAccessToken } = useSession();
  const [rows, setRows] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'forbidden' | 'network' | 'error' | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);

  const load = useCallback(
    async (append = false, resetCursor = false) => {
      const token = getAccessToken();
      if (!token) {
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (typeFilter) {
          params.set('type', typeFilter);
        }
        if (personFilter.trim()) {
          params.set('person_id', personFilter.trim());
        }
        const pageCursor = append && !resetCursor ? cursor : null;
        if (pageCursor) {
          params.set('cursor', pageCursor);
        }
        const body = await adminJson<{ data?: SecurityEvent[]; next_cursor?: string | null }>(
          token,
          `/api/v1/admin/security-events?${params.toString()}`,
        );
        setRows((prev) => (append && !resetCursor ? [...prev, ...(body.data ?? [])] : body.data ?? []));
        setCursor(body.next_cursor ?? null);
      } catch (err) {
        setError(classifyAdminViewState(err));
      } finally {
        setLoading(false);
      }
    },
    [cursor, getAccessToken, personFilter, typeFilter],
  );

  useEffect(() => {
    void load(false, true);
  }, [load]);

  const tableRows = useMemo(
    () =>
      rows.map((row) => [
        cell(row.created_at ?? row.createdAt),
        cell(row.type),
        cell(row.outcome),
        cell(row.person_id ?? row.personId),
        cell(row.request_id ?? row.requestId),
        cell(row.metadata ? JSON.stringify(row.metadata).slice(0, 80) : '—'),
      ]),
    [rows],
  );

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Audit log</Heading>
        <Text tone="secondary" className="wp-page-intro">
          Append-only security and governance events across Main Admin. Passwords, tokens, and OTP values are never
          stored.
        </Text>
      </header>

      <Card className="wp-toolbar-wrap">
        <div className="wp-toolbar admin-audit-filters">
          <FormField label="Event type">
            {({ id }) => (
              <Select
                id={id}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t || 'all'} value={t}>
                    {t || 'All types'}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Person ID">
            {({ id }) => (
              <Input
                id={id}
                placeholder="Filter by person UUID"
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
              />
            )}
          </FormField>
          <Button variant="secondary" disabled={loading} onClick={() => void load(false, true)}>
            Search
          </Button>
        </div>
      </Card>

      {loading && rows.length === 0 ? <LoadingState label="Loading audit events…" /> : null}
      {error === 'forbidden' ? <PermissionDeniedState /> : null}
      {error === 'network' || error === 'error' ? (
        <AdminViewLoadError viewState={error} onRetry={() => void load(false, true)} />
      ) : null}

      {!error && tableRows.length > 0 ? (
        <Table
          caption="Platform audit events"
          columns={['Created', 'Type', 'Outcome', 'Person', 'Request', 'Metadata']}
          rows={tableRows}
        />
      ) : null}

      {!error && !loading && tableRows.length === 0 ? (
        <Card>
          <EmptyState title="No audit events" description="Adjust filters or wait for platform activity." />
        </Card>
      ) : null}

      {cursor ? (
        <Button variant="secondary" disabled={loading} onClick={() => void load(true)}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}

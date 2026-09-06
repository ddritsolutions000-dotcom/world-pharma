'use client';

import Link from 'next/link';
import { AdminRequestError } from './admin-request-error';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import { useSession } from '@world-pharma/shell-web';
import { AdminDataTable } from './admin-data-table';
import { fetchApprovalQueue, type ApprovalItem } from './control-plane-api';

function typeLabel(type: string): string {
  switch (type) {
    case 'staff_role_grant':
      return 'Staff role';
    case 'partner_kyc':
      return 'Partner KYC';
    case 'lab_review':
      return 'Lab review';
    default:
      return type.replaceAll('_', ' ');
  }
}

export function ApprovalCenterAdmin() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState(false);

  const canRead = session.permissions?.includes('policy:read');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !canRead) {
      setDenied(!canRead);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const body = await fetchApprovalQueue(token);
      setRows(body.data ?? []);
    } catch (err) {
      if (typeof err === 'object' && err && 'status' in err && (err as { status: number }).status === 403) {
        setDenied(true);
      } else {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [canRead, getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  if (denied) {
    return <PermissionDeniedState />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Approval center</Heading>
        <p className="wp-page-intro">
          Unified queue of pending staff grants, partner KYC, and lab reviews from canonical workflow sources.
        </p>
      </header>
      <div className="wp-toolbar">
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
        <Link href="/company-authority">
          <Button variant="tertiary" size="sm">
            Company authority
          </Button>
        </Link>
        <Link href="/partners">
          <Button variant="tertiary" size="sm">
            Partners
          </Button>
        </Link>
      </div>
      {loading ? <LoadingState label="Loading approvals" /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {!loading && !error ? (
        rows.length ? (
          <AdminDataTable
            caption="Pending approvals"
            rows={rows}
            rowKey={(row) => `${row.type}-${row.id}`}
            columns={[
              {
                id: 'type',
                header: 'Type',
                cell: (row) => <Badge kind="info">{typeLabel(row.type)}</Badge>,
              },
              { id: 'title', header: 'Item', cell: (row) => row.title },
              {
                id: 'country',
                header: 'Country',
                cell: (row) => row.country_code ?? 'Global',
                hideOnMobile: true,
              },
              {
                id: 'status',
                header: 'Status',
                cell: (row) => <span className="wp-status">{row.status.replaceAll('_', ' ')}</span>,
              },
              {
                id: 'created',
                header: 'Created',
                cell: (row) => new Date(row.created_at).toLocaleString(),
                hideOnMobile: true,
              },
              {
                id: 'actions',
                header: '',
                cell: (row) => (
                  <Link href={row.href}>
                    <Button size="sm" variant="secondary">
                      Open
                    </Button>
                  </Link>
                ),
              },
            ]}
          />
        ) : (
          <EmptyState title="No pending approvals" description="All workflow queues are clear for now." />
        )
      ) : null}
      <Card>
        <Heading level={3}>Permission notes</Heading>
        <Text tone="secondary">
          Items link to the module that owns the workflow. Server-side enforcement applies on every action — this view
          aggregates read-only pending state.
        </Text>
      </Card>
    </div>
  );
}

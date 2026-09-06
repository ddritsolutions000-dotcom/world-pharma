'use client';

import { useEffect, useState } from 'react';
import { AdminRequestError } from './admin-request-error';
import { AdminHttpError, adminJson } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  LoadingState,
  PermissionDeniedState,
  Text,
  TextArea,
} from '@world-pharma/ui-kit/web';
import { AdminDataTable } from './admin-data-table';
import { statusLabel } from './partner-status-labels';

type LabSummary = {
  partner_id: string;
  display_name: string;
  status: string;
  application_id?: string;
  application_status?: string;
  country_code?: string;
  test_offer_count?: number;
};

type LabDetail = {
  partner_id: string;
  status: string;
  profile?: {
    display_name?: string;
    legal_name?: string;
    country_code?: string;
    accreditation_status?: string;
    capabilities?: string[];
  } | null;
  applications: Array<{ id: string; status: string }>;
  capabilities: Array<{ id: string; name: string; status: string }>;
  locations: Array<{ id: string; name: string; city?: string; pincode?: string }>;
  reports: Array<{ id: string; status: string; created_at: string; lab_booking_id: string }>;
  reviews: Array<{ id: string; action: string; notes?: string | null; created_at: string }>;
};

export function LabsAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<LabSummary[] | null>(null);
  const [detail, setDetail] = useState<LabDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transitionReason, setTransitionReason] = useState('');
  const [reviewNote, setReviewNote] = useState('');

  async function load() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = await adminJson<{ labs?: LabSummary[] }>(token, '/api/v1/admin/labs');
      setRows(body.labs ?? []);
      setDenied(false);
    } catch (err) {
      if (err instanceof AdminHttpError && err.status === 403) {
        setDenied(true);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(partnerId: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const body = await adminJson<LabDetail>(token, `/api/v1/admin/labs/${partnerId}`);
      setDetail(body);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function transitionApplication(applicationId: string, to: string) {
    const token = getAccessToken();
    if (!token || !detail) {
      return;
    }
    await adminJson(token, `/api/v1/admin/labs/applications/${applicationId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ to, reason: transitionReason || 'Admin review' }),
    });
    await loadDetail(detail.partner_id);
    await load();
  }

  async function addNote(action: string) {
    const token = getAccessToken();
    if (!token || !detail) {
      return;
    }
    await adminJson(token, `/api/v1/admin/labs/${detail.partner_id}/reviews`, {
      method: 'POST',
      body: JSON.stringify({ action, notes: reviewNote || undefined }),
    });
    setReviewNote('');
    await loadDetail(detail.partner_id);
  }

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [session.status, session.audience]);

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  if (denied) {
    return <PermissionDeniedState />;
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Laboratory verification &amp; operations</Heading>
        <p className="wp-page-intro">
          Review lab partner applications, accreditation, capabilities, and diagnostic bookings. Activate labs to list
          tests on the marketplace.
        </p>
      </header>
      <div className="wp-toolbar">
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
        {detail ? (
          <Button variant="ghost" onClick={() => setDetail(null)}>
            Close detail
          </Button>
        ) : null}
      </div>
      {loading && !detail && !rows?.length ? <LoadingState label="Loading laboratories" /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}

      <div className="wp-order-layout">
        <div className="wp-stack">
          {rows && rows.length === 0 && !loading ? (
            <EmptyState title="No laboratory partners" description="Lab applications appear after submission via web-join." />
          ) : null}
          {rows?.length ? (
            <AdminDataTable
              caption="Laboratory partners"
              rowKey={(row) => row.partner_id}
              rows={rows}
              activeKey={detail?.partner_id}
              columns={[
                {
                  id: 'name',
                  header: 'Laboratory',
                  cell: (row) => row.display_name || row.partner_id,
                },
                {
                  id: 'status',
                  header: 'Status',
                  cell: (row) => <span className="wp-status">{statusLabel(row.status)}</span>,
                },
                {
                  id: 'country',
                  header: 'Country',
                  hideOnMobile: true,
                  cell: (row) => row.country_code || '—',
                },
                {
                  id: 'offers',
                  header: 'Offers',
                  hideOnMobile: true,
                  cell: (row) =>
                    typeof row.test_offer_count === 'number' ? String(row.test_offer_count) : '—',
                },
                {
                  id: 'actions',
                  header: '',
                  cell: (row) => (
                    <Button
                      size="sm"
                      variant={detail?.partner_id === row.partner_id ? 'primary' : 'secondary'}
                      onClick={() => void loadDetail(row.partner_id)}
                    >
                      Review
                    </Button>
                  ),
                },
              ]}
            />
          ) : null}
        </div>

        {detail ? (
          <div className="wp-stack wp-order-detail">
          <Card>
            <Heading level={2}>Laboratory profile</Heading>
            <Text>
              <strong>{detail.profile?.display_name ?? detail.partner_id}</strong>
            </Text>
            {detail.profile?.legal_name ? (
              <Text size="caption" tone="secondary">
                Legal: {detail.profile.legal_name}
              </Text>
            ) : null}
            {detail.profile?.country_code ? (
              <Text size="caption" tone="secondary">
                Country: {detail.profile.country_code}
              </Text>
            ) : null}
            {detail.profile?.accreditation_status ? (
              <Text size="caption">Accreditation: {statusLabel(detail.profile.accreditation_status)}</Text>
            ) : null}
            <p className="wp-list-meta">Partner status: {statusLabel(detail.status)}</p>
          </Card>

          {detail.applications.length ? (
            <Card>
              <Heading level={2}>Applications</Heading>
              <FormField label="Transition reason (recorded)">
                {({ id }) => (
                  <TextArea
                    id={id}
                    rows={2}
                    value={transitionReason}
                    onChange={(e) => setTransitionReason(e.target.value)}
                  />
                )}
              </FormField>
              <div className="wp-admin-table-wrap">
                <table className="wp-table">
                  <thead>
                    <tr>
                      <th>Application</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.applications.map((app) => (
                      <tr key={app.id}>
                        <td>{app.id.slice(0, 8)}…</td>
                        <td>
                          <span className="wp-status">{statusLabel(app.status)}</span>
                        </td>
                        <td>
                          <div className="wp-toolbar">
                            {app.status === 'SUBMITTED' || app.status === 'KYC_IN_REVIEW' ? (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => void transitionApplication(app.id, 'APPROVED')}
                              >
                                Approve
                              </Button>
                            ) : null}
                            {app.status === 'APPROVED' ? (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => void transitionApplication(app.id, 'ACTIVE')}
                              >
                                Activate
                              </Button>
                            ) : null}
                            {app.status !== 'REJECTED' && app.status !== 'ACTIVE' ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void transitionApplication(app.id, 'REJECTED')}
                              >
                                Reject
                              </Button>
                            ) : null}
                            {app.status === 'NEEDS_RESUBMISSION' ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void transitionApplication(app.id, 'SUBMITTED')}
                              >
                                Mark resubmitted
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {detail.capabilities.length ? (
            <Card>
              <Heading level={2}>Capabilities &amp; test menus</Heading>
              <div className="wp-admin-table-wrap">
                <table className="wp-table">
                  <thead>
                    <tr>
                      <th>Capability</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.capabilities.map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>
                          <span className="wp-status">{statusLabel(c.status)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {detail.locations.length ? (
            <Card>
              <Heading level={2}>Collection centers / labs</Heading>
              <div className="wp-admin-table-wrap">
                <table className="wp-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.locations.map((l) => (
                      <tr key={l.id}>
                        <td>{l.name}</td>
                        <td>{[l.city, l.pincode].filter(Boolean).join(', ') || 'No address'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          {detail.reports.length ? (
            <Card>
              <Heading level={2}>Recent reports</Heading>
              <div className="wp-admin-table-wrap">
                <table className="wp-table">
                  <thead>
                    <tr>
                      <th>Report</th>
                      <th>Status</th>
                      <th>Booking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.reports.slice(0, 10).map((r) => (
                      <tr key={r.id}>
                        <td>{r.id.slice(0, 8)}…</td>
                        <td>
                          <span className="wp-status">{statusLabel(r.status)}</span>
                        </td>
                        <td>
                          {r.lab_booking_id.slice(0, 8)}… · {r.created_at}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          <Card>
            <Heading level={2}>Admin notes</Heading>
            <FormField label="Note">
              {({ id }) => (
                <TextArea id={id} rows={3} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
              )}
            </FormField>
            <div className="wp-toolbar">
              <Button size="sm" variant="secondary" onClick={() => void addNote('FLAG')}>
                Flag
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void addNote('CLEAR')}>
                Clear flag
              </Button>
            </div>
            {detail.reviews.length ? (
              <ul className="wp-event-list">
                {detail.reviews.map((r) => (
                  <li key={r.id}>
                    <Text size="caption">
                      {r.created_at} · {r.action}
                      {r.notes ? ` — ${r.notes}` : ''}
                    </Text>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
          </div>
        ) : null}
      </div>
    </section>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { AdminRequestError } from './admin-request-error';
import { adminFetch } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import { statusLabel } from './partner-status-labels';

async function adminCall(path: string, token: string, init: RequestInit = {}) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
  };
  const res = await adminFetch(token, path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error((body as { detail?: string }).detail ?? 'request_failed'), {
      status: res.status,
    });
  }
  return body;
}

type DoctorSummary = {
  partner_id: string;
  display_name: string;
  status: string;
  application_id?: string;
  application_status?: string;
};

type DoctorDetail = {
  partner_id: string;
  status: string;
  profile?: { display_name?: string; specialties?: string[] } | null;
  credentials: Array<{ id: string; credential_type: string; status: string; issuer: string }>;
  applications: Array<{ id: string; status: string }>;
  reviews: Array<{ id: string; action: string; notes?: string | null; created_at: string }>;
};

export function DoctorsAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<DoctorSummary[] | null>(null);
  const [detail, setDetail] = useState<DoctorDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transitionReason, setTransitionReason] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [credentialNote, setCredentialNote] = useState('');

  async function load() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = await adminCall('/api/v1/admin/doctors', token);
      setRows((body.doctors ?? []) as DoctorSummary[]);
      setDenied(false);
    } catch (err) {
      if ((err as { status?: number }).status === 403) {
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
      const body = (await adminCall(`/api/v1/admin/doctors/${partnerId}`, token)) as DoctorDetail;
      setDetail(body);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function reviewCredential(credentialId: string, status: 'VERIFIED' | 'REJECTED') {
    const token = getAccessToken();
    if (!token || !detail) {
      return;
    }
    await adminCall(
      `/api/v1/admin/doctors/${detail.partner_id}/credentials/${credentialId}/review`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({ status, note: credentialNote || undefined }),
      },
    );
    await loadDetail(detail.partner_id);
  }

  async function transitionApplication(applicationId: string, to: string) {
    const token = getAccessToken();
    if (!token || !detail) {
      return;
    }
    await adminCall(`/api/v1/admin/doctors/applications/${applicationId}/transition`, token, {
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
    await adminCall(`/api/v1/admin/doctors/${detail.partner_id}/reviews`, token, {
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

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Doctor verification</Heading>
        <p className="wp-page-intro">
          Review doctor partner applications, credentials, and activation. KYC documents use the partner application
          queue. Clinical records are not shown here.
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
      {loading && !detail && !rows?.length ? <LoadingState label="Loading doctors" /> : null}
      {denied ? <EmptyState title="Permission denied" description="Requires doctor:review." /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}

      <div className="wp-order-layout">
        <div className="wp-stack">
          {rows && rows.length === 0 && !loading ? (
            <EmptyState title="No doctor partners" description="Doctor applications appear after submission." />
          ) : null}
          {rows?.length ? (
            <div className="wp-admin-table-wrap">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th>Doctor</th>
                    <th>Status</th>
                    <th>Application</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.partner_id}
                      className={detail?.partner_id === row.partner_id ? 'wp-admin-row-active' : undefined}
                    >
                      <td>{row.display_name || row.partner_id}</td>
                      <td>
                        <span className="wp-status">{statusLabel(row.status)}</span>
                      </td>
                      <td>{row.application_status ? statusLabel(row.application_status) : '—'}</td>
                      <td>
                        <Button
                          size="sm"
                          variant={detail?.partner_id === row.partner_id ? 'primary' : 'secondary'}
                          onClick={() => void loadDetail(row.partner_id)}
                        >
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        {detail ? (
          <div className="wp-stack wp-order-detail">
          <Card>
            <h2 className="wp-section-title">{detail.profile?.display_name ?? detail.partner_id}</h2>
            <span className="wp-status">{statusLabel(detail.status)}</span>
            {detail.profile?.specialties?.length ? (
              <p className="wp-list-meta">Specialties: {detail.profile.specialties.join(', ')}</p>
            ) : null}
          </Card>

          <Heading level={3}>Credentials</Heading>
          {detail.credentials.length === 0 ? (
            <Text tone="secondary">No credentials submitted.</Text>
          ) : (
            <div className="wp-admin-table-wrap">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Issuer</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {detail.credentials.map((cred) => (
                    <tr key={cred.id}>
                      <td>{cred.credential_type}</td>
                      <td>{cred.issuer}</td>
                      <td>
                        <span className="wp-status">{cred.status}</span>
                      </td>
                      <td>
                        <div className="wp-row-actions">
                          <Button size="sm" onClick={() => void reviewCredential(cred.id, 'VERIFIED')}>
                            Verify
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => void reviewCredential(cred.id, 'REJECTED')}>
                            Reject
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <FormField label="Credential review note">
            {({ id }) => <Input id={id} value={credentialNote} onChange={(e) => setCredentialNote(e.target.value)} />}
          </FormField>

          <Heading level={3}>Applications</Heading>
          {detail.applications.map((app) => (
            <Card key={app.id}>
              <Text>{statusLabel(app.status)}</Text>
              <FormField label="Transition reason">
                {({ id }) => (
                  <Input id={id} value={transitionReason} onChange={(e) => setTransitionReason(e.target.value)} />
                )}
              </FormField>
              <Button size="sm" onClick={() => void transitionApplication(app.id, 'UNDER_REVIEW')}>
                Mark under review
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void transitionApplication(app.id, 'APPROVED')}>
                Approve
              </Button>
              <Button size="sm" variant="tertiary" onClick={() => void transitionApplication(app.id, 'REJECTED')}>
                Reject
              </Button>
            </Card>
          ))}

          <Heading level={3}>Verification notes</Heading>
          <FormField label="Note">
            {({ id }) => <Input id={id} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />}
          </FormField>
          <Button size="sm" onClick={() => void addNote('verification_note')}>
            Add note
          </Button>
          {detail.reviews.map((row) => (
            <Text key={row.id} size="caption">
              {row.action}: {row.notes ?? '—'} ({row.created_at})
            </Text>
          ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

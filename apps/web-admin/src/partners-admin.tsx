'use client';

import { useEffect, useState } from 'react';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  Text,
} from '@world-pharma/ui-kit/web';

async function adminCall(path: string, token: string, init: RequestInit = {}) {
  const base = apiBaseUrl(typeof process === 'undefined' ? {} : process.env);
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${base}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error((body as { detail?: string }).detail ?? 'request_failed'), {
      status: res.status,
    });
  }
  return body;
}

type ApplicationSummary = { id: string; status: string; partner_type_code: string; partner_id?: string };
type ApplicationDetail = ApplicationSummary & {
  rejection_reason?: string | null;
  info_request?: string | null;
  partner?: { id: string; person_id?: string; organization_id?: string | null };
  history?: Array<{ to_status: string; reason: string; created_at: string }>;
  kyc_cases?: Array<{ id: string; status: string }>;
};

type MarketplaceAdminView = {
  state: string;
  acceptance: string;
  live_payout: boolean;
  blocked_reason?: string | null;
  next_action?: string | null;
};

type LabAdminView = {
  state: string;
  acceptance: string;
  booking_enabled: boolean;
  live_payout: boolean;
  blocked_reason?: string | null;
  next_action?: string | null;
};

type ImagingAdminView = {
  state: string;
  acceptance: string;
  booking_enabled: boolean;
  live_payout: boolean;
  blocked_reason?: string | null;
  next_action?: string | null;
};

export function PartnersAdmin() {
  const { session, signInWithOtp, getAccessToken } = useSession();
  const [email, setEmail] = useState('');
  const [rows, setRows] = useState<ApplicationSummary[]>([]);
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [documents, setDocuments] = useState<Array<{ id: string; document_type_code: string; status: string }>>([]);
  const [viewer, setViewer] = useState<{ name: string; contentType: string; watermark: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rejectReason, setRejectReason] = useState('');
  const [orgId, setOrgId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [roleCode, setRoleCode] = useState('org_operations');
  const [assignShipmentId, setAssignShipmentId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [marketplaceOrgId, setMarketplaceOrgId] = useState('');
  const [marketplaceView, setMarketplaceView] = useState<MarketplaceAdminView | null>(null);
  const [labOrgId, setLabOrgId] = useState('');
  const [labView, setLabView] = useState<LabAdminView | null>(null);
  const [imagingOrgId, setImagingOrgId] = useState('');
  const [imagingView, setImagingView] = useState<ImagingAdminView | null>(null);
  const [physicalReports, setPhysicalReports] = useState<Array<{ id: string; status: string; lab_booking_id: string }>>(
    [],
  );

  const load = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = await adminCall('/api/v1/admin/partners/applications', token);
      setRows((body.data ?? []) as ApplicationSummary[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const [app, docs] = await Promise.all([
        adminCall(`/api/v1/admin/partners/applications/${id}`, token),
        adminCall(`/api/v1/admin/partners/applications/${id}/documents`, token),
      ]);
      setDetail(app as ApplicationDetail);
      setDocuments((docs.data ?? []) as typeof documents);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const transition = async (to: string, reason: string) => {
    const token = getAccessToken();
    if (!token || !detail) {
      return;
    }
    await adminCall(`/api/v1/admin/partners/applications/${detail.id}/transition`, token, {
      method: 'POST',
      body: JSON.stringify({ to, reason }),
    });
    await loadDetail(detail.id);
    await load();
  };

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [session.status, session.audience]);

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return (
      <div className="wp-stack">
        <Heading level={2}>Partner applications</Heading>
        <Text tone="secondary">Admin OTP sign-in required for review queue.</Text>
        <FormField label="Admin email">
          {({ id }) => <Input id={id} value={email} onChange={(e) => setEmail(e.target.value)} />}
        </FormField>
        <Button onClick={() => void signInWithOtp(email, 'admin').then(() => load())}>Sign in with OTP</Button>
        {error ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}
      </div>
    );
  }

  return (
    <div className="wp-stack">
      <Heading level={2}>Partner applications</Heading>
      <Button variant="secondary" onClick={() => void load()}>
        Refresh queue
      </Button>
      {loading ? <LoadingState label="Loading applications" /> : null}
      {error ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} /> : null}

      {!detail ? (
        <>
          {rows.length === 0 && !loading ? (
            <EmptyState title="No applications" description="Submitted partner applications appear here." />
          ) : null}
          {rows.map((row) => (
            <Card key={row.id}>
              <Text>
                {row.partner_type_code} — {row.status}
              </Text>
              <Button size="sm" variant="secondary" onClick={() => void loadDetail(row.id)}>
                Review
              </Button>
            </Card>
          ))}
        </>
      ) : (
        <Card>
          <Button variant="tertiary" size="sm" onClick={() => setDetail(null)}>
            Back to queue
          </Button>
          <Heading level={3}>
            {detail.partner_type_code} — {detail.status}
          </Heading>
          <Text size="caption">Application {detail.id}</Text>
          {detail.partner?.person_id ? <Text>Applicant person: {detail.partner.person_id}</Text> : null}
          {detail.rejection_reason ? <Text tone="secondary">Rejection: {detail.rejection_reason}</Text> : null}
          {detail.info_request ? <Text tone="secondary">Info request: {detail.info_request}</Text> : null}

          <Heading level={4}>KYC documents</Heading>
          {documents.length === 0 ? (
            <Text tone="secondary">No documents uploaded yet.</Text>
          ) : (
            documents.map((doc) => (
              <div key={doc.id} className="wp-stack" style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Text>
                  {doc.document_type_code} — {doc.status}
                </Text>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const token = getAccessToken();
                    if (!token) {
                      return;
                    }
                    void adminCall(`/api/v1/admin/partners/documents/${doc.id}`, token).then((body) => {
                      setViewer({
                        name: body.original_name as string,
                        contentType: body.content_type as string,
                        watermark: (body.watermark as string) ?? 'CONFIDENTIAL',
                      });
                    });
                  }}
                >
                  View (audited)
                </Button>
              </div>
            ))
          )}
          {viewer ? (
            <Text tone="secondary">
              Viewing {viewer.name} ({viewer.contentType}) — {viewer.watermark}
            </Text>
          ) : null}

          <Heading level={4}>Review actions</Heading>
          <FormField label="Reject / info reason">
            {({ id }) => <Input id={id} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />}
          </FormField>
          <div className="wp-stack" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void transition('UNDER_REVIEW', 'admin_review')}
            >
              Mark under review
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void transition('VERIFIED', 'kyc_verified')}>
              Verify
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void transition('APPROVED', 'approved')}>
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void transition('REJECTED', rejectReason || 'rejected')}
            >
              Reject
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void transition('ADDITIONAL_INFORMATION_REQUIRED', rejectReason || 'more_info')
              }
            >
              Request info
            </Button>
          </div>

          <Heading level={4}>Activate</Heading>
          <Text tone="secondary">Org roles only — company_* roles cannot be granted.</Text>
          <FormField label="Organization ID">
            {({ id }) => <Input id={id} value={orgId} onChange={(e) => setOrgId(e.target.value)} />}
          </FormField>
          <FormField label="Location ID">
            {({ id }) => <Input id={id} value={locationId} onChange={(e) => setLocationId(e.target.value)} />}
          </FormField>
          <FormField label="Role code">
            {({ id }) => <Input id={id} value={roleCode} onChange={(e) => setRoleCode(e.target.value)} />}
          </FormField>
          <Button
            onClick={() => {
              const token = getAccessToken();
              if (!token || !detail || !orgId) {
                return;
              }
              void adminCall(`/api/v1/admin/partners/applications/${detail.id}/activate`, token, {
                method: 'POST',
                body: JSON.stringify({
                  organization_id: orgId,
                  location_id: locationId || undefined,
                  role_code: roleCode,
                }),
              })
                .then(() => loadDetail(detail.id))
                .catch((err: Error) => setError(err.message));
            }}
          >
            Activate partner
          </Button>

          <Heading level={4}>Marketplace eligibility (sandbox)</Heading>
          <Text tone="secondary">
            Company acceptance for seller marketplace participation. Not live payout authorization.
          </Text>
          <FormField label="Seller organization ID">
            {({ id }) => (
              <Input
                id={id}
                value={marketplaceOrgId}
                onChange={(e) => setMarketplaceOrgId(e.target.value)}
                placeholder="vendor organization uuid"
              />
            )}
          </FormField>
          {marketplaceView ? (
            <Text size="caption">
              State {marketplaceView.state} · acceptance {marketplaceView.acceptance} · live_payout=
              {String(marketplaceView.live_payout)} · {marketplaceView.blocked_reason ?? marketplaceView.next_action ?? ''}
            </Text>
          ) : null}
          <div className="wp-stack" style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const token = getAccessToken();
                if (!token || !marketplaceOrgId.trim()) {
                  return;
                }
                void adminCall(
                  `/api/v1/admin/marketplace/eligibility?seller_org_id=${encodeURIComponent(marketplaceOrgId.trim())}`,
                  token,
                )
                  .then((body) => {
                    setMarketplaceView(body as MarketplaceAdminView);
                    setError(null);
                  })
                  .catch((err: Error) => setError(err.message));
              }}
            >
              Load eligibility
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const token = getAccessToken();
                if (!token || !marketplaceOrgId.trim()) {
                  return;
                }
                void adminCall('/api/v1/admin/marketplace/acceptance', token, {
                  method: 'POST',
                  body: JSON.stringify({ seller_org_id: marketplaceOrgId.trim(), action: 'accept' }),
                })
                  .then((body) => setMarketplaceView(body as MarketplaceAdminView))
                  .catch((err: Error) => setError(err.message));
              }}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const token = getAccessToken();
                if (!token || !marketplaceOrgId.trim()) {
                  return;
                }
                void adminCall('/api/v1/admin/marketplace/acceptance', token, {
                  method: 'POST',
                  body: JSON.stringify({
                    seller_org_id: marketplaceOrgId.trim(),
                    action: 'block',
                    reason: 'Blocked by company governance',
                  }),
                })
                  .then((body) => setMarketplaceView(body as MarketplaceAdminView))
                  .catch((err: Error) => setError(err.message));
              }}
            >
              Block
            </Button>
          </div>

          <Heading level={4}>Lab capability (sandbox)</Heading>
          <Text tone="secondary">
            Company acceptance for laboratory participation. Not booking, CoC, pathology, or live money.
          </Text>
          <FormField label="Lab organization ID">
            {({ id }) => (
              <Input
                id={id}
                value={labOrgId}
                onChange={(e) => setLabOrgId(e.target.value)}
                placeholder="lab organization uuid"
              />
            )}
          </FormField>
          {labView ? (
            <Text size="caption">
              State {labView.state} · acceptance {labView.acceptance} · booking=
              {String(labView.booking_enabled)} · live_payout={String(labView.live_payout)} ·{' '}
              {labView.blocked_reason ?? labView.next_action ?? ''}
            </Text>
          ) : null}
          <div className="wp-stack" style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const token = getAccessToken();
                if (!token || !labOrgId.trim()) {
                  return;
                }
                void adminCall(
                  `/api/v1/admin/lab/eligibility?lab_org_id=${encodeURIComponent(labOrgId.trim())}`,
                  token,
                )
                  .then((body) => {
                    setLabView(body as LabAdminView);
                    setError(null);
                  })
                  .catch((err: Error) => setError(err.message));
              }}
            >
              Load lab eligibility
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const token = getAccessToken();
                if (!token || !labOrgId.trim()) {
                  return;
                }
                void adminCall('/api/v1/admin/lab/acceptance', token, {
                  method: 'POST',
                  body: JSON.stringify({ lab_org_id: labOrgId.trim(), action: 'accept' }),
                })
                  .then((body) => setLabView(body as LabAdminView))
                  .catch((err: Error) => setError(err.message));
              }}
            >
              Accept lab
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const token = getAccessToken();
                if (!token || !labOrgId.trim()) {
                  return;
                }
                void adminCall('/api/v1/admin/lab/acceptance', token, {
                  method: 'POST',
                  body: JSON.stringify({
                    lab_org_id: labOrgId.trim(),
                    action: 'block',
                    reason: 'Blocked by company governance',
                  }),
                })
                  .then((body) => setLabView(body as LabAdminView))
                  .catch((err: Error) => setError(err.message));
              }}
            >
              Block lab
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const token = getAccessToken();
                if (!token || !labOrgId.trim()) {
                  return;
                }
                void adminCall(
                  `/api/v1/admin/lab/physical-reports?lab_org_id=${encodeURIComponent(labOrgId.trim())}`,
                  token,
                )
                  .then((body: { data: Array<{ id: string; status: string; lab_booking_id: string }> }) => {
                    setPhysicalReports(body.data);
                    setError(null);
                  })
                  .catch((err: Error) => setError(err.message));
              }}
            >
              Load physical reports
            </Button>
          </div>
          {physicalReports.length ? (
            <div className="wp-stack">
              <Heading level={4}>Physical report metadata</Heading>
              {physicalReports.map((row) => (
                <Text key={row.id} size="caption">
                  {row.id.slice(0, 8)} · booking {row.lab_booking_id.slice(0, 8)} · {row.status}
                </Text>
              ))}
            </div>
          ) : null}

          <Heading level={4}>Imaging capability (sandbox)</Heading>
          <Text tone="secondary">
            Company acceptance for imaging center participation. Not booking, acquisition, DICOM/PACS, or live money.
          </Text>
          <FormField label="Imaging center organization ID">
            {({ id }) => (
              <Input
                id={id}
                value={imagingOrgId}
                onChange={(e) => setImagingOrgId(e.target.value)}
                placeholder="imaging center organization uuid"
              />
            )}
          </FormField>
          {imagingView ? (
            <Text size="caption">
              State {imagingView.state} · acceptance {imagingView.acceptance} · booking=
              {String(imagingView.booking_enabled)} · live_payout={String(imagingView.live_payout)} ·{' '}
              {imagingView.blocked_reason ?? imagingView.next_action ?? ''}
            </Text>
          ) : null}
          <div className="wp-stack" style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const token = getAccessToken();
                if (!token || !imagingOrgId.trim()) {
                  return;
                }
                void adminCall(
                  `/api/v1/admin/imaging/eligibility?imaging_org_id=${encodeURIComponent(imagingOrgId.trim())}`,
                  token,
                )
                  .then((body) => {
                    setImagingView(body as ImagingAdminView);
                    setError(null);
                  })
                  .catch((err: Error) => setError(err.message));
              }}
            >
              Load imaging eligibility
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const token = getAccessToken();
                if (!token || !imagingOrgId.trim()) {
                  return;
                }
                void adminCall('/api/v1/admin/imaging/acceptance', token, {
                  method: 'POST',
                  body: JSON.stringify({ imaging_org_id: imagingOrgId.trim(), action: 'accept' }),
                })
                  .then((body) => setImagingView(body as ImagingAdminView))
                  .catch((err: Error) => setError(err.message));
              }}
            >
              Accept imaging center
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const token = getAccessToken();
                if (!token || !imagingOrgId.trim()) {
                  return;
                }
                void adminCall('/api/v1/admin/imaging/acceptance', token, {
                  method: 'POST',
                  body: JSON.stringify({
                    imaging_org_id: imagingOrgId.trim(),
                    action: 'block',
                    reason: 'Blocked by company governance',
                  }),
                })
                  .then((body) => setImagingView(body as ImagingAdminView))
                  .catch((err: Error) => setError(err.message));
              }}
            >
              Block imaging center
            </Button>
          </div>

          <Heading level={4}>Delivery assignment</Heading>
          <FormField label="Shipment ID">
            {({ id }) => (
              <Input id={id} value={assignShipmentId} onChange={(e) => setAssignShipmentId(e.target.value)} />
            )}
          </FormField>
          <FormField label="Assignee person ID">
            {({ id }) => <Input id={id} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} />}
          </FormField>
          <Button
            variant="secondary"
            onClick={() => {
              const token = getAccessToken();
              if (!token || !assignShipmentId || !assigneeId) {
                return;
              }
              void adminCall('/api/v1/admin/delivery/jobs/assign', token, {
                method: 'POST',
                body: JSON.stringify({ shipment_id: assignShipmentId, assignee_id: assigneeId }),
              }).catch((err: Error) => setError(err.message));
            }}
          >
            Assign delivery job
          </Button>
        </Card>
      )}
    </div>
  );
}

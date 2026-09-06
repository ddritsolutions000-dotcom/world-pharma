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
  PermissionDeniedState,
  Select,
  Text,
} from '@world-pharma/ui-kit/web';
import { partnerFieldLabel, PARTNER_FIELD_LABELS } from '@world-pharma/shared/partner-fields';
import { canPartnerTransition, statusLabel } from './partner-status-labels';
import { AdminDataTable } from './admin-data-table';
import { presentLocationPicks, presentOrgPicks, presentPartnerPeople, type OrgPickRow, type PersonPickRow } from './eligibility-admin-present';
import { shipmentStatusLabel } from './shipment-status-labels';

const ORG_ACTIVATE_ROLES = [
  'org_operations',
  'org_staff',
  'org_manager',
  'org_admin',
  'org_owner',
  'org_finance',
] as const;

type LocationPick = { id: string; name: string };
type ShipmentPick = { id: string; status: string; tracking_number?: string | null };

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

type ApplicationSummary = { id: string; status: string; partner_type_code: string; partner_id?: string };
type ApplicationDetail = ApplicationSummary & {
  rejection_reason?: string | null;
  info_request?: string | null;
  application_fields?: Record<string, string>;
  requested_fields?: string[];
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

type OnboardingAdminView = {
  lifecycle_phase: string;
  ready_for_activation: boolean;
  marketplace_visible: boolean;
  conditions: Array<{ code: string; label: string; satisfied: boolean; required: boolean; detail?: string | null }>;
  next_actions: string[];
};

type PartnerOpsAdminView = {
  lifecycle: string;
  final_status: string;
  ready_for_activation: boolean;
  marketplace_purchasable: boolean;
  partner_id: string;
  country_code: string;
  blockers: string[];
  warnings: string[];
  licence_readiness: { status: string; verified: boolean; expired: boolean };
  kyc_readiness: {
    status: string | null;
    verified: boolean;
    verification_class: string | null;
    external_gated: boolean;
  };
  commercial_readiness: {
    approved: boolean;
    approved_by_id: string | null;
    approved_at: string | null;
  };
  catalog_readiness: { ready: boolean; offer_count: number };
  inventory_readiness: { ready: boolean };
  serviceability_readiness: { ready: boolean; required: boolean };
  country_production: { lifecycle: string; active: boolean };
  document_checklist: Array<{
    requirement_code: string;
    label: string;
    required: boolean;
    submitted: boolean;
    verified: boolean;
    expiry: string | null;
    status: string;
  }>;
};

export function PartnersAdmin() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<ApplicationSummary[]>([]);
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [documents, setDocuments] = useState<Array<{ id: string; document_type_code: string; status: string }>>([]);
  const [viewer, setViewer] = useState<{
    name: string;
    contentType: string;
    watermark: string;
    objectUrl?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opsView, setOpsView] = useState<PartnerOpsAdminView | null>(null);
  const [pharmacyLicence, setPharmacyLicence] = useState<{
    id: string;
    status?: string;
    licenceNumber?: string;
    licence_number?: string;
  } | null>(null);
  const [opsNotes, setOpsNotes] = useState('');

  const [rejectReason, setRejectReason] = useState('');
  const [requestedFieldCodes, setRequestedFieldCodes] = useState<string[]>([]);
  const [docReviewReason, setDocReviewReason] = useState('');
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
  const [onboardingView, setOnboardingView] = useState<OnboardingAdminView | null>(null);
  const [physicalReports, setPhysicalReports] = useState<Array<{ id: string; status: string; lab_booking_id: string }>>(
    [],
  );
  const [orgs, setOrgs] = useState<OrgPickRow[]>([]);
  const [locations, setLocations] = useState<LocationPick[]>([]);
  const [shipments, setShipments] = useState<ShipmentPick[]>([]);
  const [riders, setRiders] = useState<PersonPickRow[]>([]);

  const load = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [body, orgBody, shipBody] = await Promise.all([
        adminCall('/api/v1/admin/partners/applications', token),
        adminCall('/api/v1/admin/governance/organizations', token).catch(() => ({ data: [] })),
        adminCall('/api/v1/admin/shipments', token).catch(() => ({ data: [] })),
      ]);
      setRows((body.data ?? []) as ApplicationSummary[]);
      setOrgs(
        presentOrgPicks(orgBody, ['VENDOR', 'PHARMACY_OWNED', 'PLATFORM', 'LAB', 'IMAGING_CENTER', 'AFFILIATE_ORG']),
      );
      const nextShipments = ((shipBody as { data?: ShipmentPick[] }).data ?? []) as ShipmentPick[];
      setShipments(nextShipments);
      setAssignShipmentId((current) => current || nextShipments[0]?.id || '');
      const nextRiders = presentPartnerPeople(body, ['DELIVERY_PARTNER']);
      setRiders(nextRiders);
      setAssigneeId((current) => current || nextRiders[0]?.id || '');
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
      const [app, docs, onboarding, ops] = await Promise.all([
        adminCall(`/api/v1/admin/partners/applications/${id}`, token),
        adminCall(`/api/v1/admin/partners/applications/${id}/documents`, token),
        adminCall(`/api/v1/admin/partners/applications/${id}/onboarding`, token).catch(() => null),
        adminCall(`/api/v1/admin/partners/applications/${id}/operations-readiness`, token).catch(() => null),
      ]);
      setDetail(app as ApplicationDetail);
      setDocuments((docs.data ?? []) as typeof documents);
      setOnboardingView(
        onboarding && Array.isArray((onboarding as OnboardingAdminView).conditions)
          ? (onboarding as OnboardingAdminView)
          : null,
      );
      setOpsView(
        ops && typeof (ops as PartnerOpsAdminView).lifecycle === 'string'
          ? (ops as PartnerOpsAdminView)
          : null,
      );
      const partnerId =
        (ops as PartnerOpsAdminView | null)?.partner_id ??
        (app as ApplicationDetail).partner?.id ??
        (app as ApplicationDetail).partner_id;
      if (partnerId) {
        const licence = await adminCall(`/api/v1/admin/partners/${partnerId}/pharmacy-licence`, token).catch(
          () => null,
        );
        setPharmacyLicence(
          licence && typeof (licence as { id?: string }).id === 'string'
            ? (licence as { id: string; status?: string; licenceNumber?: string; licence_number?: string })
            : null,
        );
      } else {
        setPharmacyLicence(null);
      }
      const linkedOrg = (app as ApplicationDetail).partner?.organization_id;
      if (linkedOrg) {
        setOrgId((current) => current || linkedOrg);
        setMarketplaceOrgId((current) => current || linkedOrg);
        setLabOrgId((current) => current || linkedOrg);
        setImagingOrgId((current) => current || linkedOrg);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const reviewDocument = async (documentId: string, approve: boolean) => {
    const token = getAccessToken();
    if (!token || !detail) {
      return;
    }
    await adminCall(`/api/v1/admin/partners/documents/${documentId}/review`, token, {
      method: 'POST',
      body: JSON.stringify({ approve, reason: docReviewReason || undefined }),
    });
    await loadDetail(detail.id);
  };

  const transition = async (to: string, reason: string, requested_fields?: string[]) => {
    const token = getAccessToken();
    if (!token || !detail) {
      return;
    }
    await adminCall(`/api/v1/admin/partners/applications/${detail.id}/transition`, token, {
      method: 'POST',
      body: JSON.stringify({ to, reason, requested_fields }),
    });
    await loadDetail(detail.id);
    await load();
  };

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [session.status, session.audience]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !orgId.trim()) {
      setLocations([]);
      return;
    }
    void adminCall(
      `/api/v1/admin/governance/locations?organization_id=${encodeURIComponent(orgId.trim())}`,
      token,
    )
      .then((body) => {
        const rows = presentLocationPicks(body);
        setLocations(rows);
        setLocationId((current) =>
          current && rows.some((row) => row.id === current) ? current : rows[0]?.id || '',
        );
      })
      .catch(() => setLocations([]));
  }, [getAccessToken, orgId]);

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return <PermissionDeniedState />;
  }

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Partner applications</Heading>
        <p className="wp-page-intro">
          Review onboarding queue, KYC documents, and partner lifecycle transitions. No credential values are shown.
        </p>
      </header>
      <div className="wp-toolbar">
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh queue'}
        </Button>
        {detail ? (
          <Button variant="ghost" onClick={() => setDetail(null)}>
            Close detail
          </Button>
        ) : null}
      </div>
      {loading && !rows.length && !detail ? <LoadingState label="Loading applications" /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}

      <div className="wp-order-layout">
        <div className="wp-stack">
          {rows.length === 0 && !loading ? (
            <EmptyState title="No applications" description="Submitted partner applications appear here." />
          ) : null}
          {rows.length ? (
            <AdminDataTable
              caption="Partner applications"
              rows={rows}
              rowKey={(row) => row.id}
              activeKey={detail?.id}
              columns={[
                { id: 'type', header: 'Type', cell: (row) => row.partner_type_code },
                {
                  id: 'status',
                  header: 'Status',
                  cell: (row) => <span className="wp-status">{statusLabel(row.status)}</span>,
                },
                {
                  id: 'application',
                  header: 'Application',
                  cell: (row) => `${row.id.slice(0, 8)}…`,
                  hideOnMobile: true,
                },
                {
                  id: 'actions',
                  header: '',
                  cell: (row) => (
                    <Button
                      size="sm"
                      variant={detail?.id === row.id ? 'primary' : 'secondary'}
                      onClick={() => void loadDetail(row.id)}
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
        <Card className="wp-order-detail">
          <Button variant="tertiary" size="sm" onClick={() => setDetail(null)}>
            Back to queue
          </Button>
          <Heading level={3}>
            {detail.partner_type_code} — {statusLabel(detail.status)}
          </Heading>
          <Text size="caption">Application {detail.id}</Text>
          {detail.partner?.person_id ? <Text>Applicant person: {detail.partner.person_id}</Text> : null}
          {detail.rejection_reason ? <Text tone="secondary">Rejection: {detail.rejection_reason}</Text> : null}
          {detail.info_request ? <Text tone="secondary">Info request: {detail.info_request}</Text> : null}
          {detail.requested_fields?.length ? (
            <Text tone="secondary">Requested fields: {detail.requested_fields.join(', ')}</Text>
          ) : null}
          {detail.application_fields && Object.keys(detail.application_fields).length ? (
            <>
              <Heading level={4}>Submitted application fields</Heading>
              {Object.entries(detail.application_fields).map(([code, value]) => (
                <Text key={code}>
                  {partnerFieldLabel(code)}: {value}
                </Text>
              ))}
            </>
          ) : null}

          <Heading level={4}>KYC documents</Heading>
          {documents.length === 0 ? (
            <Text tone="secondary">No documents uploaded yet.</Text>
          ) : (
            documents.map((doc) => (
              <div key={doc.id} className="wp-stack join-doc-row">
                <Text>
                  {doc.document_type_code} — {doc.status}
                </Text>
                <div className="wp-toolbar">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const token = getAccessToken();
                      if (!token) {
                        return;
                      }
                      void (async () => {
                        const meta = await adminCall(`/api/v1/admin/partners/documents/${doc.id}`, token);
                        const ticket = meta.access_ticket as string | undefined;
                        if (!ticket) {
                          throw new Error('Document access ticket missing');
                        }
                        const contentRes = await adminFetch(
                          token,
                          `/api/v1/admin/partners/documents/${doc.id}/content?ticket=${encodeURIComponent(ticket)}`,
                        );
                        if (!contentRes.ok) {
                          const errBody = await contentRes.json().catch(() => ({}));
                          throw new Error(
                            (errBody as { detail?: string }).detail ?? 'document_content_failed',
                          );
                        }
                        if (viewer?.objectUrl) {
                          URL.revokeObjectURL(viewer.objectUrl);
                        }
                        const blob = await contentRes.blob();
                        const objectUrl = URL.createObjectURL(blob);
                        setViewer({
                          name: (meta.original_name as string) ?? 'document',
                          contentType: (meta.content_type as string) ?? blob.type,
                          watermark: (meta.watermark as string) ?? 'CONFIDENTIAL',
                          objectUrl,
                        });
                      })().catch((err: Error) => {
                        setViewer({
                          name: doc.document_type_code,
                          contentType: 'text/plain',
                          watermark: err.message || 'View failed',
                        });
                      });
                    }}
                  >
                    View (audited)
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void reviewDocument(doc.id, true)}>
                    Verify document
                  </Button>
                  <Button
                    size="sm"
                    variant="tertiary"
                    onClick={() => void reviewDocument(doc.id, false)}
                  >
                    Reject document
                  </Button>
                </div>
              </div>
            ))
          )}
          {viewer ? (
            <Card>
              <Text tone="secondary">
                Viewing {viewer.name} ({viewer.contentType}) — {viewer.watermark}
              </Text>
              {viewer.objectUrl && viewer.contentType.startsWith('image/') ? (
                <img
                  src={viewer.objectUrl}
                  alt={viewer.name}
                  style={{ maxWidth: '100%', maxHeight: 480, objectFit: 'contain' }}
                />
              ) : null}
              {viewer.objectUrl && viewer.contentType === 'application/pdf' ? (
                <iframe
                  title={viewer.name}
                  src={viewer.objectUrl}
                  style={{ width: '100%', height: 480, border: '1px solid var(--wp-border, #ddd)' }}
                />
              ) : null}
              {viewer.objectUrl ? (
                <div className="wp-toolbar">
                  <a href={viewer.objectUrl} download={viewer.name}>
                    <Button size="sm" variant="secondary">
                      Download
                    </Button>
                  </a>
                  <Button
                    size="sm"
                    variant="tertiary"
                    onClick={() => {
                      if (viewer.objectUrl) {
                        URL.revokeObjectURL(viewer.objectUrl);
                      }
                      setViewer(null);
                    }}
                  >
                    Close viewer
                  </Button>
                </div>
              ) : (
                <Text size="caption">Ticket issued but preview unavailable for this type.</Text>
              )}
            </Card>
          ) : null}
          <FormField label="Document review note (optional)">
            {({ id }) => (
              <Input id={id} value={docReviewReason} onChange={(e) => setDocReviewReason(e.target.value)} />
            )}
          </FormField>

          <Heading level={4}>Review actions</Heading>
          <FormField label="Reject / info reason">
            {({ id }) => <Input id={id} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />}
          </FormField>
          <Text tone="secondary" size="caption">
            Select fields the applicant must complete when requesting additional information.
          </Text>
          <div className="wp-stack" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {Object.keys(PARTNER_FIELD_LABELS).map((code) => (
              <label key={code} className="wp-inline-actions">
                <input
                  type="checkbox"
                  checked={requestedFieldCodes.includes(code)}
                  onChange={(e) =>
                    setRequestedFieldCodes((prev) =>
                      e.target.checked ? [...prev, code] : prev.filter((row) => row !== code),
                    )
                  }
                />
                <Text size="caption">{partnerFieldLabel(code)}</Text>
              </label>
            ))}
          </div>
          <div className="wp-stack" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {canPartnerTransition(detail.status, 'UNDER_REVIEW') ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void transition('UNDER_REVIEW', 'admin_review')}
              >
                Mark under review
              </Button>
            ) : null}
            {canPartnerTransition(detail.status, 'VERIFIED') ? (
              <Button variant="secondary" size="sm" onClick={() => void transition('VERIFIED', 'kyc_verified')}>
                Verify
              </Button>
            ) : null}
            {canPartnerTransition(detail.status, 'APPROVED') ? (
              <Button variant="secondary" size="sm" onClick={() => void transition('APPROVED', 'approved')}>
                Approve
              </Button>
            ) : null}
            {canPartnerTransition(detail.status, 'REJECTED') ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void transition('REJECTED', rejectReason || 'rejected')}
              >
                Reject
              </Button>
            ) : null}
            {canPartnerTransition(detail.status, 'ADDITIONAL_INFORMATION_REQUIRED') ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  void transition(
                    'ADDITIONAL_INFORMATION_REQUIRED',
                    rejectReason || 'more_info',
                    requestedFieldCodes.length ? requestedFieldCodes : undefined,
                  )
                }
              >
                Request info
              </Button>
            ) : null}
            {!canPartnerTransition(detail.status, 'UNDER_REVIEW') &&
            !canPartnerTransition(detail.status, 'VERIFIED') &&
            !canPartnerTransition(detail.status, 'APPROVED') &&
            !canPartnerTransition(detail.status, 'REJECTED') &&
            !canPartnerTransition(detail.status, 'ADDITIONAL_INFORMATION_REQUIRED') ? (
              <Text tone="secondary" size="caption">
                No review transitions available from {statusLabel(detail.status)}. Use activation/ops controls below when
                eligible, or wait for applicant document submission.
              </Text>
            ) : null}
          </div>

          {onboardingView ? (
            <>
              <Heading level={4}>Onboarding readiness</Heading>
              <Text tone="secondary">
                Phase {onboardingView.lifecycle_phase}
                {onboardingView.ready_for_activation ? ' · ready for activation' : ''}
              </Text>
              <ul className="wp-mini-list">
                {(onboardingView.conditions ?? [])
                  .filter((row) => row.required)
                  .map((row) => (
                    <li key={row.code}>
                      <Text size="caption">
                        {row.label}: {row.satisfied ? 'done' : 'pending'}
                        {row.detail ? ` — ${row.detail}` : ''}
                      </Text>
                    </li>
                  ))}
              </ul>
            </>
          ) : null}

          {opsView ? (
            <>
              <Heading level={4}>Partner operations control center</Heading>
              <Text tone="secondary">
                Lifecycle {opsView.lifecycle} · {opsView.final_status}
                {opsView.marketplace_purchasable ? ' · marketplace purchasable' : ' · not purchasable'}
                {opsView.country_production.active ? ' · country production ACTIVE' : ` · country ${opsView.country_production.lifecycle}`}
              </Text>
              <Text size="caption">
                Licence: {opsView.licence_readiness.status}
                {opsView.licence_readiness.verified ? ' (verified)' : ''}
                {opsView.licence_readiness.expired ? ' (expired)' : ''}
              </Text>
              {!pharmacyLicence &&
              (opsView.licence_readiness.status === 'NOT_SUBMITTED' ||
                opsView.blockers.some((b) => /LICENCE_NOT_SUBMITTED|LICENSE_MISSING/i.test(b))) ? (
                <Text tone="secondary">
                  Licence missing — partner must submit pharmacy licence from seller portal.
                </Text>
              ) : null}
              {pharmacyLicence ? (
                <div className="wp-inline-actions">
                  <Text size="caption">
                    Licence record {pharmacyLicence.licence_number ?? pharmacyLicence.licenceNumber ?? pharmacyLicence.id.slice(0, 8)}{' '}
                    · {pharmacyLicence.status ?? opsView.licence_readiness.status}
                  </Text>
                  <Text size="caption">Operator verification only — not a regulator database confirmation.</Text>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const token = getAccessToken();
                      if (!token || !pharmacyLicence) return;
                      void adminCall(
                        `/api/v1/admin/partners/licences/${pharmacyLicence.id}/under-review`,
                        token,
                        { method: 'POST', body: '{}' },
                      )
                        .then(() => (detail ? loadDetail(detail.id) : undefined))
                        .catch((err: Error) => setError(err.message));
                    }}
                  >
                    Licence under review
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const token = getAccessToken();
                      if (!token || !pharmacyLicence) return;
                      void adminCall(`/api/v1/admin/partners/licences/${pharmacyLicence.id}/verify`, token, {
                        method: 'POST',
                        body: '{}',
                      })
                        .then(() => (detail ? loadDetail(detail.id) : undefined))
                        .catch((err: Error) => setError(err.message));
                    }}
                  >
                    Verify licence
                  </Button>
                  <Button
                    size="sm"
                    variant="tertiary"
                    onClick={() => {
                      const token = getAccessToken();
                      if (!token || !pharmacyLicence) return;
                      const reason = window.prompt('Rejection reason') ?? '';
                      if (!reason.trim()) return;
                      void adminCall(`/api/v1/admin/partners/licences/${pharmacyLicence.id}/reject`, token, {
                        method: 'POST',
                        body: JSON.stringify({ reason }),
                      })
                        .then(() => (detail ? loadDetail(detail.id) : undefined))
                        .catch((err: Error) => setError(err.message));
                    }}
                  >
                    Reject licence
                  </Button>
                </div>
              ) : null}
              <Text size="caption">
                KYC: {opsView.kyc_readiness.status ?? 'NONE'}
                {opsView.kyc_readiness.verification_class
                  ? ` · ${opsView.kyc_readiness.verification_class}`
                  : ''}
                {opsView.kyc_readiness.external_gated ? ' · live provider EXTERNAL_GATED' : ''}
              </Text>
              <Text size="caption">
                Commercial: {opsView.commercial_readiness.approved ? 'approved' : 'not approved'}
                {opsView.commercial_readiness.approved_by_id
                  ? ` by ${opsView.commercial_readiness.approved_by_id.slice(0, 8)}`
                  : ''}
              </Text>
              <Text size="caption">
                Catalog {opsView.catalog_readiness.ready ? 'ready' : 'blocked'} ({opsView.catalog_readiness.offer_count} offers) ·
                Inventory {opsView.inventory_readiness.ready ? 'ready' : 'blocked'} ·
                Serviceability{' '}
                {opsView.serviceability_readiness.required
                  ? opsView.serviceability_readiness.ready
                    ? 'ready'
                    : 'blocked'
                  : 'n/a'}
              </Text>
              {opsView.document_checklist.length ? (
                <>
                  <Heading level={4}>Document checklist</Heading>
                  <ul className="wp-mini-list">
                    {opsView.document_checklist.map((row) => (
                      <li key={`${row.requirement_code}-${row.status}`}>
                        <Text size="caption">
                          {row.label}: req={row.required ? 'Y' : 'N'} · sub={row.submitted ? 'Y' : 'N'} ·
                          ver={row.verified ? 'Y' : 'N'} · {row.status}
                          {row.expiry ? ` · exp ${row.expiry.slice(0, 10)}` : ''}
                        </Text>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <Text size="caption">No country regulatory document requirements configured.</Text>
              )}
              {opsView.blockers.length ? (
                <Text tone="secondary">Blockers: {opsView.blockers.join(', ')}</Text>
              ) : null}
              {opsView.warnings.length ? (
                <Text size="caption">{opsView.warnings.join(' · ')}</Text>
              ) : null}
              <FormField label="Ops notes">
                {({ id }) => (
                  <Input id={id} value={opsNotes} onChange={(e) => setOpsNotes(e.target.value)} />
                )}
              </FormField>
              <div className="wp-inline-actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const token = getAccessToken();
                    if (!token || !opsView) return;
                    void adminCall(
                      `/api/v1/admin/partners/${opsView.partner_id}/commercial-approval/approve`,
                      token,
                      { method: 'POST', body: JSON.stringify({ notes: opsNotes || undefined }) },
                    )
                      .then(() => detail && loadDetail(detail.id))
                      .catch((err: Error) => setError(err.message));
                  }}
                >
                  Approve commercial
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const token = getAccessToken();
                    if (!token || !opsView) return;
                    void adminCall(
                      `/api/v1/admin/partners/${opsView.partner_id}/commercial-approval/revoke`,
                      token,
                      { method: 'POST', body: JSON.stringify({ notes: opsNotes || undefined }) },
                    )
                      .then(() => detail && loadDetail(detail.id))
                      .catch((err: Error) => setError(err.message));
                  }}
                >
                  Revoke commercial
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const token = getAccessToken();
                    if (!token || !detail) return;
                    void adminCall(
                      `/api/v1/admin/partners/applications/${detail.id}/activate-pharmacy`,
                      token,
                      {
                        method: 'POST',
                        body: JSON.stringify({
                          organization_id: orgId || undefined,
                          location_id: locationId || undefined,
                          role_code: roleCode,
                        }),
                      },
                    )
                      .then(() => loadDetail(detail.id))
                      .catch((err: Error) => setError(err.message));
                  }}
                >
                  Activate pharmacy partner
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const token = getAccessToken();
                    if (!token || !opsView) return;
                    void adminCall(`/api/v1/admin/partners/${opsView.partner_id}/suspend`, token, {
                      method: 'POST',
                      body: JSON.stringify({ reason: opsNotes || 'Suspended by admin' }),
                    })
                      .then(() => detail && loadDetail(detail.id))
                      .catch((err: Error) => setError(err.message));
                  }}
                >
                  Suspend
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const token = getAccessToken();
                    if (!token || !opsView) return;
                    void adminCall(`/api/v1/admin/partners/${opsView.partner_id}/reactivate`, token, {
                      method: 'POST',
                      body: JSON.stringify({ reason: opsNotes || 'Reactivated by admin' }),
                    })
                      .then(() => detail && loadDetail(detail.id))
                      .catch((err: Error) => setError(err.message));
                  }}
                >
                  Reactivate
                </Button>
              </div>
            </>
          ) : null}

          <Heading level={4}>Provision seller organization</Heading>
          <Text tone="secondary">
            Creates a vendor organization and warehouse location from application fields after approval.
          </Text>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const token = getAccessToken();
              if (!token || !detail) {
                return;
              }
              void adminCall(`/api/v1/admin/partners/applications/${detail.id}/provision-org`, token, {
                method: 'POST',
              })
                .then(() => loadDetail(detail.id))
                .catch((err: Error) => setError(err.message));
            }}
          >
            Provision from application
          </Button>

          <Heading level={4}>Activate</Heading>
          <Text tone="secondary">Org roles only — company_* roles cannot be granted.</Text>
          <FormField label="Organization">
            {({ id }) => (
              <Select id={id} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                <option value="">Select organization</option>
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.kind})
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Location">
            {({ id }) => (
              <Select id={id} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">None (org only)</option>
                {locations.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Role">
            {({ id }) => (
              <Select id={id} value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
                {ORG_ACTIVATE_ROLES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <Button
            onClick={() => {
              const token = getAccessToken();
              if (!token || !detail) {
                return;
              }
              void adminCall(`/api/v1/admin/partners/applications/${detail.id}/activate`, token, {
                method: 'POST',
                body: JSON.stringify({
                  organization_id: orgId || undefined,
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

          <Heading level={4}>Lifecycle controls</Heading>
          <Text tone="secondary">
            Suspension blocks marketplace participation via existing partner state machine. Reactivation requests must
            follow readiness rules.
          </Text>
          <div className="wp-stack" style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void transition('SUSPENDED', 'admin_suspension')}
            >
              Suspend partner
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void transition('REACTIVATION_REQUESTED', 'admin_reactivation_request')}
            >
              Request reactivation
            </Button>
          </div>

          <Heading level={4}>Marketplace eligibility (sandbox)</Heading>
          <Text tone="secondary">
            Company acceptance for seller marketplace participation. Not live payout authorization.
          </Text>
          <FormField label="Seller organization">
            {({ id }) => (
              <Select id={id} value={marketplaceOrgId} onChange={(e) => setMarketplaceOrgId(e.target.value)}>
                <option value="">Select vendor</option>
                {orgs
                  .filter((org) => org.kind === 'VENDOR')
                  .map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
              </Select>
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
          <FormField label="Lab organization">
            {({ id }) => (
              <Select id={id} value={labOrgId} onChange={(e) => setLabOrgId(e.target.value)}>
                <option value="">Select laboratory</option>
                {orgs
                  .filter((org) => org.kind === 'LAB')
                  .map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
              </Select>
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
          <FormField label="Imaging center">
            {({ id }) => (
              <Select id={id} value={imagingOrgId} onChange={(e) => setImagingOrgId(e.target.value)}>
                <option value="">Select imaging center</option>
                {orgs
                  .filter((org) => org.kind === 'IMAGING_CENTER')
                  .map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
              </Select>
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
          <FormField label="Shipment">
            {({ id }) => (
              <Select
                id={id}
                value={assignShipmentId}
                onChange={(e) => setAssignShipmentId(e.target.value)}
                disabled={shipments.length === 0}
              >
                {shipments.length === 0 ? <option value="">No shipments loaded</option> : null}
                {shipments.map((row) => (
                  <option key={row.id} value={row.id}>
                    {shipmentStatusLabel(row.status)} · {row.tracking_number ?? row.id.slice(0, 8)}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Rider">
            {({ id }) =>
              riders.length ? (
                <Select id={id} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  {riders.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input id={id} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} />
              )
            }
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
        ) : null}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
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
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { VendorCtaLink } from './vendor-cta-link';
import { VendorJoinAuthPanel } from './vendor-join-auth-panel';
import {
  fetchJoinApplication,
  fetchJoinApplicationDocuments,
  fetchJoinOnboarding,
  fetchMyJoinApplications,
  fetchVendorOpsReadiness,
  submitJoinApplication,
  submitPharmacyLicence,
  type JoinApplicationRow,
  type OnboardingReadiness,
  type VendorOpsReadiness,
} from './vendor-join-api';
import { joinStatusLabel, joinStatusNextAction } from './vendor-join-labels';
import { VENDOR_JOIN_ROUTES, VENDOR_PARTNER_TYPE } from './vendor-join-routes';
import { VendorJoinSupportPanel } from './vendor-join-support-panel';
import { statusBadgeClass } from './vendor-format';

export function VendorJoinStatusPanel() {
  const { session, getAccessToken, signOut } = useSession();
  const [applications, setApplications] = useState<JoinApplicationRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JoinApplicationRow | null>(null);
  const [docSummary, setDocSummary] = useState<Array<{ document_type_code: string; status: string }>>([]);
  const [readiness, setReadiness] = useState<OnboardingReadiness | null>(null);
  const [opsReadiness, setOpsReadiness] = useState<VendorOpsReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licenceAuthority, setLicenceAuthority] = useState('');
  const [licenceNumber, setLicenceNumber] = useState('');
  const [pharmacist, setPharmacist] = useState('');
  const [licenceBusy, setLicenceBusy] = useState(false);
  const [licenceMessage, setLicenceMessage] = useState<string | null>(null);

  const refresh = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const body = await fetchMyJoinApplications(token);
      setApplications((body.data ?? []).filter((row) => row.partner_type_code === VENDOR_PARTNER_TYPE));
      setError(null);
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
    setSelectedId(id);
    setLoading(true);
    try {
      const [app, docs, onboarding, ops] = await Promise.all([
        fetchJoinApplication(token, id),
        fetchJoinApplicationDocuments(token, id),
        fetchJoinOnboarding(token, id),
        fetchVendorOpsReadiness(token, id).catch(() => null),
      ]);
      if (app.partner_type_code !== VENDOR_PARTNER_TYPE) {
        setError('Only marketplace vendor applications are shown on this site.');
        return;
      }
      setDetail(app);
      setDocSummary(docs.data ?? []);
      setReadiness(onboarding);
      setOpsReadiness(ops);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session.status === 'authenticated') {
      void refresh();
    }
  }, [session.status]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.audience && session.audience !== 'partner_applicant' && session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  if (session.status !== 'authenticated') {
    return (
      <div className="vendor-join-system wp-stack">
        <header className="vendor-join-system-head">
          <p className="vendor-section-eyebrow">Vendor application</p>
          <Heading level={1}>Track your vendor application</Heading>
          <Text tone="secondary">Sign in with the email you used when applying as a marketplace vendor seller.</Text>
        </header>
        <Card>
          <VendorJoinAuthPanel
            title="Vendor applicant sign-in"
            description="Use your business email. OTP is the same identity used after company approval."
          />
        </Card>
        <VendorCtaLink href={VENDOR_JOIN_ROUTES.apply} variant="secondary">
          Start new vendor application
        </VendorCtaLink>
      </div>
    );
  }

  return (
    <div className="vendor-join-system wp-stack">
      <header className="vendor-join-system-head">
        <p className="vendor-section-eyebrow">Vendor application</p>
        <Heading level={1}>Your vendor applications</Heading>
        <Text tone="secondary">Marketplace vendor applications only. Document filenames and status — not file content.</Text>
        <div className="vendor-join-actions">
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>
            Refresh
          </Button>
          <VendorCtaLink href={VENDOR_JOIN_ROUTES.apply} size="sm">
            New vendor application
          </VendorCtaLink>
        </div>
      </header>

      {loading && !detail ? <LoadingState label="Loading applications…" /> : null}
      {error ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void refresh() }} /> : null}

      <div className="wp-order-layout">
        <Card>
          <Heading level={2}>Applications ({applications.length})</Heading>
          {applications.length === 0 && !loading ? (
            <EmptyState
              title="No vendor applications yet"
              description="Start a marketplace vendor application to begin onboarding."
            />
          ) : (
            <ul className="wp-mini-list">
              {applications.map((app) => (
                <li key={app.id}>
                  <button
                    type="button"
                    className={`wp-order-row${selectedId === app.id ? ' wp-order-row--active' : ''}`}
                    onClick={() => void loadDetail(app.id)}
                  >
                    <div className="wp-mini-main">
                      <p className="wp-mini-title">
                        <span className="wp-mini-id">Marketplace vendor</span>
                        <span className={statusBadgeClass(app.status)}>{joinStatusLabel(app.status)}</span>
                      </p>
                      <p className="wp-mini-meta">{app.id.slice(0, 8)} · {app.created_at?.slice(0, 10) ?? '—'}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="wp-order-detail">
          {!detail ? (
            <Card>
              <EmptyState title="Select an application" description="Choose a row to view status, documents, and history." />
            </Card>
          ) : (
            <Card>
              <Button variant="tertiary" size="sm" onClick={() => setDetail(null)}>
                Back to list
              </Button>
              <Heading level={2}>Marketplace vendor — {joinStatusLabel(detail.status)}</Heading>
              {joinStatusNextAction(detail.status) ? (
                <Text tone="secondary">{joinStatusNextAction(detail.status)}</Text>
              ) : null}
              {detail.rejection_reason ? <Text tone="secondary">Rejection: {detail.rejection_reason}</Text> : null}
              {detail.info_request ? <Text tone="secondary">Company request: {detail.info_request}</Text> : null}

              {readiness ? (
                <>
                  <Heading level={3}>Onboarding readiness</Heading>
                  <Text tone="secondary">
                    Phase {readiness.lifecycle_phase}
                    {readiness.ready_for_activation ? ' · Ready for activation' : ''}
                    {readiness.marketplace_visible ? ' · Marketplace visible' : ''}
                  </Text>
                  <ul className="wp-mini-list">
                    {readiness.conditions
                      .filter((row) => row.required)
                      .map((row) => (
                        <li key={row.code} className="wp-mini-row">
                          <div className="wp-mini-main">
                            <p className="wp-mini-title">
                              {row.label} · {row.satisfied ? 'done' : 'pending'}
                            </p>
                            {row.detail ? <p className="wp-mini-meta">{row.detail}</p> : null}
                            {!row.satisfied && row.next_action ? (
                              <p className="wp-mini-meta">{row.next_action}</p>
                            ) : null}
                          </div>
                        </li>
                      ))}
                  </ul>
                  {readiness.next_actions.length ? (
                    <Text tone="secondary">Next: {readiness.next_actions.join(' · ')}</Text>
                  ) : null}
                </>
              ) : null}

              {opsReadiness ? (
                <>
                  <Heading level={3}>Marketplace operations readiness</Heading>
                  <Text tone="secondary">
                    Stage {opsReadiness.lifecycle} · {opsReadiness.final_status}
                    {opsReadiness.marketplace_purchasable ? ' · purchasable' : ' · not purchasable'}
                  </Text>
                  <Text size="caption">
                    Licence {opsReadiness.licence_readiness.status}
                    {opsReadiness.licence_readiness.verified ? ' (verified)' : ''} · KYC{' '}
                    {opsReadiness.kyc_readiness.status ?? 'NONE'}
                    {opsReadiness.kyc_readiness.external_gated ? ' (live provider gated)' : ''} · Commercial{' '}
                    {opsReadiness.commercial_readiness.approved ? 'approved' : 'pending'}
                  </Text>
                  {readiness?.pharmacy_licence?.applicable &&
                  !readiness.pharmacy_licence.verified &&
                  readiness.partner_id ? (
                    <Card>
                      <Heading level={4}>Submit pharmacy licence</Heading>
                      <Text size="caption" tone="secondary">
                        {readiness.pharmacy_licence.next_step ??
                          'Company operator verification only — not a live government registry check.'}
                      </Text>
                      {opsReadiness.licence_readiness.status === 'NOT_SUBMITTED' ||
                      opsReadiness.licence_readiness.status === 'REJECTED' ||
                      !opsReadiness.licence_readiness.status ? (
                        <div className="wp-stack">
                          <FormField label="Licensing authority">
                            {({ id }) => (
                              <Input
                                id={id}
                                value={licenceAuthority}
                                onChange={(e) => setLicenceAuthority(e.target.value)}
                              />
                            )}
                          </FormField>
                          <FormField label="Licence number">
                            {({ id }) => (
                              <Input
                                id={id}
                                value={licenceNumber}
                                onChange={(e) => setLicenceNumber(e.target.value)}
                              />
                            )}
                          </FormField>
                          <FormField label="Responsible pharmacist (optional)">
                            {({ id }) => (
                              <Input
                                id={id}
                                value={pharmacist}
                                onChange={(e) => setPharmacist(e.target.value)}
                              />
                            )}
                          </FormField>
                          <Button
                            disabled={
                              licenceBusy || !licenceAuthority.trim() || !licenceNumber.trim()
                            }
                            onClick={() => {
                              const token = getAccessToken();
                              if (!token || !readiness.partner_id) {
                                return;
                              }
                              setLicenceBusy(true);
                              setLicenceMessage(null);
                              void submitPharmacyLicence(token, {
                                partner_id: readiness.partner_id,
                                licenceAuthority: licenceAuthority.trim(),
                                licenceNumber: licenceNumber.trim(),
                                responsiblePharmacist: pharmacist.trim() || undefined,
                              })
                                .then((body) => {
                                  setLicenceMessage(`Submitted — status ${body.status}. Awaiting company review.`);
                                  if (selectedId) {
                                    void loadDetail(selectedId);
                                  }
                                })
                                .catch((err: Error) => setLicenceMessage(err.message))
                                .finally(() => setLicenceBusy(false));
                            }}
                          >
                            {licenceBusy ? 'Submitting…' : 'Submit pharmacy licence for company review'}
                          </Button>
                          {licenceMessage ? <Text size="caption">{licenceMessage}</Text> : null}
                        </div>
                      ) : (
                        <Text size="caption">
                          Licence already {opsReadiness.licence_readiness.status}
                          {opsReadiness.licence_readiness.verified ? ' and verified' : ' — awaiting operator review'}.
                        </Text>
                      )}
                    </Card>
                  ) : null}
                  <Text size="caption">
                    Catalog {opsReadiness.catalog_readiness.ready ? 'ready' : 'blocked'} · Inventory{' '}
                    {opsReadiness.inventory_readiness.ready ? 'ready' : 'blocked'} · Serviceability{' '}
                    {opsReadiness.serviceability_readiness.required
                      ? opsReadiness.serviceability_readiness.ready
                        ? 'ready'
                        : 'blocked'
                      : 'n/a'}
                  </Text>
                  {opsReadiness.document_checklist.length ? (
                    <ul className="wp-mini-list">
                      {opsReadiness.document_checklist
                        .filter((row) => row.required && !row.verified)
                        .map((row) => (
                          <li key={row.requirement_code}>
                            <Text size="caption">
                              Missing/pending: {row.label} ({row.status})
                            </Text>
                          </li>
                        ))}
                    </ul>
                  ) : null}
                  {opsReadiness.blockers.length ? (
                    <div className="wp-blocker-list" role="status">
                      <Text>
                        <strong>What is blocking readiness</strong>
                      </Text>
                      <ul className="wp-mini-list">
                        {opsReadiness.blockers.map((blocker) => (
                          <li key={blocker}>
                            <Text size="caption">
                              {blocker}
                              {/licence|license|kyc|commercial|approv/i.test(blocker)
                                ? ' — Admin must verify; vendors cannot self-approve.'
                                : /catalog|inventory|serviceability|offer|price/i.test(blocker)
                                  ? ' — Complete the matching step in Catalog / Inventory, then refresh.'
                                  : ' — Resolve this item, then refresh readiness.'}
                            </Text>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : null}

              <Heading level={3}>Documents</Heading>
              {docSummary.length === 0 ? (
                <Text tone="secondary">No documents uploaded yet.</Text>
              ) : (
                <ul className="wp-mini-list">
                  {docSummary.map((doc) => (
                    <li key={doc.document_type_code} className="wp-mini-row">
                      <div className="wp-mini-main">
                        <p className="wp-mini-title">{doc.document_type_code}</p>
                        <p className="wp-mini-meta">{doc.status}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <Heading level={3}>History</Heading>
              {detail.history?.length ? (
                <ul className="vendor-join-history">
                  {detail.history.map((row, index) => (
                    <li key={`${row.created_at}-${index}`}>
                      <Text size="caption">
                        {row.created_at} → {joinStatusLabel(row.to_status)} ({row.reason})
                      </Text>
                    </li>
                  ))}
                </ul>
              ) : (
                <Text tone="secondary">No status history yet.</Text>
              )}

              <div className="vendor-join-actions">
                {['DRAFT', 'DOCUMENTS_REQUIRED', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(detail.status) ? (
                  <>
                    <VendorCtaLink href={`${VENDOR_JOIN_ROUTES.apply}?application=${detail.id}`} variant="secondary">
                      Continue application
                    </VendorCtaLink>
                    <Button
                      onClick={() => {
                        const token = getAccessToken();
                        if (!token) {
                          return;
                        }
                        void submitJoinApplication(token, detail.id)
                          .then(() => loadDetail(detail.id))
                          .catch((err: Error) => setError(err.message));
                      }}
                    >
                      {detail.status === 'ADDITIONAL_INFORMATION_REQUIRED' ? 'Resubmit' : 'Submit'}
                    </Button>
                  </>
                ) : null}
                {detail.status === 'ACTIVE' || detail.status === 'APPROVED' ? (
                  <VendorCtaLink href="/workspace">Open seller workspace</VendorCtaLink>
                ) : null}
              </div>
            </Card>
          )}
        </div>
      </div>

      {getAccessToken() ? (
        <Card>
          <Heading level={2}>Support</Heading>
          <VendorJoinSupportPanel
            token={getAccessToken()!}
            applicationId={selectedId ?? detail?.id ?? null}
            onError={(err) => setError((err as Error).message)}
          />
        </Card>
      ) : null}
    </div>
  );
}

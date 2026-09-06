'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { JoinAuthPanel } from './join-auth-panel';
import {
  fetchApplication,
  fetchApplicationDocuments,
  fetchJoinOnboarding,
  fetchMyApplications,
  submitApplication,
  type JoinApplicationRow,
  type JoinOnboardingReadiness,
} from './join-api';
import { JoinSupportPanel } from './join-support-panel';
import { JoinInboxPanel } from './join-inbox-panel';
import {
  portalLabelForPartnerType,
  portalUrlForPartnerType,
  pharmacyLicencePortalUrl,
  statusLabel,
  statusNextAction,
} from './join-status-labels';

export function JoinStatusPage() {
  const { session, getAccessToken, signOut } = useSession();
  const [applications, setApplications] = useState<JoinApplicationRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JoinApplicationRow | null>(null);
  const [docSummary, setDocSummary] = useState<Array<{ document_type_code: string; status: string }>>([]);
  const [onboarding, setOnboarding] = useState<JoinOnboardingReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const body = await fetchMyApplications(token);
      setApplications((body.data ?? []) as JoinApplicationRow[]);
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
      const [app, docs, readiness] = await Promise.all([
        fetchApplication(token, id),
        fetchApplicationDocuments(token, id),
        fetchJoinOnboarding(token, id).catch(() => null),
      ]);
      setDetail(app as JoinApplicationRow);
      setDocSummary(docs.data ?? []);
      setOnboarding(readiness);
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
      <div className="wp-stack">
        <Heading level={1}>Track application</Heading>
        <Text tone="secondary">Sign in to view your partner applications and document status.</Text>
        <Card>
          <JoinAuthPanel
            title="Applicant sign-in"
            description="Use the email you applied with. You can track status even when public join is closed."
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="wp-stack">
      <Heading level={1}>Application status</Heading>
      <Text tone="secondary">Only your applications are shown. Document content is not displayed here — metadata only.</Text>
      <Button variant="secondary" size="sm" onClick={() => void refresh()}>
        Refresh
      </Button>
      {loading ? <LoadingState label="Loading applications" /> : null}
      {error ? <NetworkErrorState action={{ label: 'Retry', onClick: () => void refresh() }} /> : null}

      {applications.length === 0 && !loading ? (
        <>
          <EmptyState title="No applications yet" description="Start a new application from the apply page." />
          <Link href="/apply">
            <Button>Apply now</Button>
          </Link>
        </>
      ) : null}

      {!detail ? (
        applications.map((app) => (
          <Card key={app.id}>
            <Text>
              {app.partner_type_code} — <Badge kind="info">{statusLabel(app.status)}</Badge>
            </Text>
            {app.rejection_reason ? <Text tone="secondary">Rejection: {app.rejection_reason}</Text> : null}
            {app.info_request ? <Text tone="secondary">Action required: {app.info_request}</Text> : null}
            <Button size="sm" variant="secondary" onClick={() => void loadDetail(app.id)}>
              View details
            </Button>
          </Card>
        ))
      ) : (
        <Card>
          <Button variant="tertiary" size="sm" onClick={() => setDetail(null)}>
            Back to list
          </Button>
          <Heading level={2}>
            {detail.partner_type_code} — {statusLabel(detail.status)}
          </Heading>
          {statusNextAction(detail.status) ? <Text tone="secondary">{statusNextAction(detail.status)}</Text> : null}
          {detail.rejection_reason ? <Text tone="secondary">Rejection reason: {detail.rejection_reason}</Text> : null}
          {detail.info_request ? <Text tone="secondary">Company request: {detail.info_request}</Text> : null}

          <Heading level={3}>Documents</Heading>
          {docSummary.length === 0 ? (
            <Text tone="secondary">No documents uploaded yet.</Text>
          ) : (
            <ul className="join-steps">
              {docSummary.map((doc) => (
                <li key={doc.document_type_code}>
                  <Text>
                    {doc.document_type_code} — {doc.status}
                  </Text>
                </li>
              ))}
            </ul>
          )}

          <Heading level={3}>History</Heading>
          {detail.history?.length ? (
            <ul className="join-steps">
              {detail.history.map((row, index) => (
                <li key={`${row.created_at}-${index}`}>
                  <Text size="caption">
                    {row.created_at} → {statusLabel(row.to_status)} ({row.reason})
                  </Text>
                </li>
              ))}
            </ul>
          ) : (
            <Text tone="secondary">No status history yet.</Text>
          )}

          {detail.status === 'DRAFT' ||
          detail.status === 'DOCUMENTS_REQUIRED' ||
          detail.status === 'ADDITIONAL_INFORMATION_REQUIRED' ? (
            <div className="join-cta-row">
              <Link href={`/apply?application=${detail.id}`}>
                <Button variant="secondary">Continue application</Button>
              </Link>
              <Button
                onClick={() => {
                  const token = getAccessToken();
                  if (!token) {
                    return;
                  }
                  void submitApplication(token, detail.id)
                    .then(() => loadDetail(detail.id))
                    .catch((err: Error) => setError(err.message));
                }}
              >
                {detail.status === 'ADDITIONAL_INFORMATION_REQUIRED' ? 'Resubmit' : 'Submit'}
              </Button>
            </div>
          ) : null}

          {detail.status === 'ACTIVE' || detail.status === 'APPROVED' ? (
            <>
              <Heading level={3}>Next step</Heading>
              <Text tone="secondary">
                Open the {portalLabelForPartnerType(detail.partner_type_code)} with the same email (customer OTP).
              </Text>
              {portalUrlForPartnerType(detail.partner_type_code) ? (
                <a href={portalUrlForPartnerType(detail.partner_type_code)!} target="_blank" rel="noreferrer">
                  <Button>Open portal</Button>
                </a>
              ) : null}
            </>
          ) : null}

          {onboarding?.pharmacy_licence?.applicable && !onboarding.pharmacy_licence.verified ? (
            <>
              <Heading level={3}>Pharmacy licence readiness</Heading>
              <Text tone="secondary">
                Status: {onboarding.pharmacy_licence.status}
                {onboarding.pharmacy_licence.next_step ? ` — ${onboarding.pharmacy_licence.next_step}` : ''}
              </Text>
              {pharmacyLicencePortalUrl(detail.partner_type_code) ? (
                <a
                  href={pharmacyLicencePortalUrl(detail.partner_type_code)!}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button variant="secondary">Open seller licence readiness</Button>
                </a>
              ) : null}
            </>
          ) : null}
        </Card>
      )}

      {getAccessToken() ? (
        <Card>
          <Heading level={2}>Notifications</Heading>
          <JoinInboxPanel
            token={getAccessToken()!}
            onOpenApplication={(id) => void loadDetail(id)}
            onError={(err) => setError((err as Error).message)}
          />
        </Card>
      ) : null}

      {getAccessToken() ? (
        <Card>
          <Heading level={2}>Support</Heading>
          <JoinSupportPanel
            token={getAccessToken()!}
            applicationId={selectedId ?? detail?.id ?? null}
            onError={(err) => setError((err as Error).message)}
          />
        </Card>
      ) : null}
    </div>
  );
}

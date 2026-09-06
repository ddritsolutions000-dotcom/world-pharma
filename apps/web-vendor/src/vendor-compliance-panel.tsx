'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import { fetchMarketplaceEligibility, type MarketplaceEligibility } from './vendor-api';
import { fetchMyJoinApplications, fetchJoinApplicationDocuments, type JoinApplicationRow, type JoinDocumentRow } from './vendor-join-api';
import { statusBadgeClass } from './vendor-format';
import { VENDOR_JOIN_ROUTES } from './vendor-join-routes';
import type { VendorOrganization } from './vendor-api';

export function VendorCompliancePanel({
  organizationId,
  organization,
  token,
  onError,
  onNavigate,
}: {
  organizationId: string;
  organization: VendorOrganization | null;
  token: string;
  onError: (err: unknown) => void;
  onNavigate?: (tab: 'marketplace') => void;
}) {
  const [eligibility, setEligibility] = useState<MarketplaceEligibility | null>(null);
  const [applications, setApplications] = useState<JoinApplicationRow[]>([]);
  const [documents, setDocuments] = useState<JoinDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [elig, apps] = await Promise.all([
        fetchMarketplaceEligibility(token, organizationId),
        fetchMyJoinApplications(token).catch(() => ({ data: [] as JoinApplicationRow[] })),
      ]);
      setEligibility(elig);
      const vendorApps = apps.data.filter((a) => a.partner_type_code === 'VENDOR');
      setApplications(vendorApps);
      const latest = vendorApps[0];
      if (latest) {
        const docs = await fetchJoinApplicationDocuments(token, latest.id).catch(() => ({
          data: [] as JoinDocumentRow[],
          kyc_case_id: null,
        }));
        setDocuments(docs.data);
      } else {
        setDocuments([]);
      }
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <LoadingState label="Loading compliance status…" />;
  }

  const rejectedDocs = documents.filter((d) => d.status.toUpperCase() === 'REJECTED').length;
  const pendingDocs = documents.filter((d) => ['PENDING', 'UNDER_REVIEW'].includes(d.status.toUpperCase())).length;
  const latestApp = applications[0];

  return (
    <div className="wp-stack">
      <Card>
        <header className="vd-panel-head">
          <Heading level={2}>Marketplace eligibility</Heading>
          {onNavigate ? (
            <Button size="sm" variant="secondary" onClick={() => onNavigate('marketplace')}>
              Manage
            </Button>
          ) : null}
        </header>
        {eligibility ? (
          <>
            <p>
              Status: <span className={statusBadgeClass(eligibility.state)}>{eligibility.state}</span>
            </p>
            <Text tone="secondary" size="caption">
              {eligibility.blocked_reason ?? eligibility.next_action ?? eligibility.sandbox_note}
            </Text>
            <ul className="vws-kv-list">
              {Object.entries(eligibility.gates).map(([key, ok]) => (
                <div key={key}>
                  <dt>{key.replaceAll('_', ' ')}</dt>
                  <dd>{ok ? 'Pass' : 'Blocked'}</dd>
                </div>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState title="Eligibility unavailable" description="Could not load marketplace eligibility." />
        )}
      </Card>

      <Card>
        <Heading level={2}>Partner application & KYC</Heading>
        {latestApp ? (
          <>
            <Text>
              Application <strong>{latestApp.id.slice(0, 8)}</strong> ·{' '}
              <span className={statusBadgeClass(latestApp.status)}>{latestApp.status}</span>
            </Text>
            {latestApp.info_request ? (
              <Text tone="secondary">Additional information requested: {latestApp.info_request}</Text>
            ) : null}
            {latestApp.rejection_reason ? (
              <Text tone="secondary">Rejection: {latestApp.rejection_reason}</Text>
            ) : null}
            <Text size="caption" tone="secondary">
              Document expiry tracking requires policy-pack metadata — not available in this API response.
            </Text>
            {documents.length ? (
              <ul className="wp-mini-list">
                {documents.map((doc) => (
                  <li key={doc.document_type_code} className="wp-mini-row">
                    <div className="wp-mini-main">
                      <p className="wp-mini-title">
                        {doc.document_type_code}
                        <span className={statusBadgeClass(doc.status)}>{doc.status}</span>
                      </p>
                      {doc.rejection_reason ? (
                        <p className="wp-mini-meta">{doc.rejection_reason}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No documents on file" description="Upload documents via the join application flow." />
            )}
            <Link href={VENDOR_JOIN_ROUTES.status}>
              <Button variant="secondary" size="sm">
                Open application tracker
              </Button>
            </Link>
          </>
        ) : (
          <EmptyState
            title="No vendor application"
            description="Complete the vendor join program to submit KYC documents for review."
          />
        )}
      </Card>

      <Card>
        <Heading level={2}>Organization</Heading>
        <ul className="vws-kv-list">
          <div>
            <dt>Legal name</dt>
            <dd>{organization?.legal_name ?? '—'}</dd>
          </div>
          <div>
            <dt>Country</dt>
            <dd>{organization?.country_code ?? '—'}</dd>
          </div>
          <div>
            <dt>Org status</dt>
            <dd>{organization?.status ?? '—'}</dd>
          </div>
        </ul>
        <Text size="caption" tone="secondary">
          Rejected documents: {rejectedDocs} · Under review: {pendingDocs}. Vendors cannot self-approve KYC.
        </Text>
      </Card>
    </div>
  );
}

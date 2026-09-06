'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  VendorApiError,
  attestMarketplaceSeller,
  fetchMarketplaceEligibility,
  type MarketplaceEligibility,
} from './vendor-api';
import { VendorCtaLink } from './vendor-cta-link';
import { VENDOR_JOIN_ROUTES } from './vendor-join-routes';
import { statusBadgeClass } from './vendor-format';

export function VendorMarketplaceEligibilityPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [view, setView] = useState<MarketplaceEligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) {
      return;
    }
    setLoading(true);
    try {
      setView(await fetchMarketplaceEligibility(token, organizationId));
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, onError, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const attest = async () => {
    if (!view) {
      return;
    }
    setBusy(true);
    setFormError(null);
    setMessage(null);
    try {
      const next = await attestMarketplaceSeller(token, organizationId, view.attestation_code_required);
      setView(next);
      setMessage('Attestation recorded. Waiting for company acceptance if still pending.');
    } catch (err) {
      if (err instanceof VendorApiError) {
        if (err.status === 401 || err.status === 403) {
          onError(err);
          return;
        }
        setFormError(err.message);
        return;
      }
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  if (loading || !view) {
    return <LoadingState label="Checking marketplace pack gates and eligibility…" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">{view.sandbox_note}</Text>
      <Card>
        <Heading level={2}>Marketplace eligibility</Heading>
        <Text>
          State <span className={statusBadgeClass(view.state)}>{view.state}</span> · Acceptance {view.acceptance} ·
          live_payout={String(view.live_payout)}
        </Text>
        <Text size="caption">
          Country {view.country_code ?? '—'} · Org {view.organization_status ?? '—'} · Pack published{' '}
          {view.pack.published ? 'yes' : 'no'}
        </Text>
        <Text size="caption">
          Gates: marketplace={String(view.gates.marketplace_participation)} · vendor_type=
          {String(view.gates.vendor_partner_type)} · catalog_write={String(view.gates.catalog_write)} ·
          settlements={String(view.gates.finance_settlement_visibility)}
        </Text>
        {view.blocked_reason ? <Text tone="secondary">{view.blocked_reason}</Text> : null}
        {view.next_action ? <Text>{view.next_action}</Text> : null}
        {view.state !== 'ELIGIBLE' && view.state !== 'REQUIRES_ATTESTATION' ? (
          <Card>
            <Heading level={3}>Not eligible yet</Heading>
            <Text tone="secondary">
              Complete vendor seller onboarding and company approval before catalog and order tools unlock. If you
              have not applied yet, start a marketplace vendor application on this site.
            </Text>
            <div className="wp-stack" style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <VendorCtaLink href={VENDOR_JOIN_ROUTES.apply}>Apply as vendor seller</VendorCtaLink>
              <Link href={VENDOR_JOIN_ROUTES.hub}>
                <Button variant="secondary">Join program info</Button>
              </Link>
            </div>
          </Card>
        ) : null}
        {view.state === 'REQUIRES_ATTESTATION' ? (
          <Button disabled={busy} onClick={() => void attest()}>
            {busy ? 'Submitting…' : `Attest ${view.attestation_code_required}`}
          </Button>
        ) : null}
        {view.state === 'ELIGIBLE' ? (
          <EmptyState
            title="Eligible for marketplace selling"
            description="Catalog, pricing, inventory, and order fulfillment are unlocked for this seller. Bank payouts stay company-controlled until live payment rails are enabled."
          />
        ) : null}
        {formError ? <Text tone="secondary">{formError}</Text> : null}
        {message ? <Text>{message}</Text> : null}
        <Button size="sm" variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </Card>
    </div>
  );
}

'use client';

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
  RadiologyApiError,
  attestImagingPartner,
  fetchImagingEligibility,
  type ImagingEligibility,
} from './radiology-api';

export function RadiologyCapabilitiesPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [view, setView] = useState<ImagingEligibility | null>(null);
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
      setView(await fetchImagingEligibility(token, organizationId));
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
      const next = await attestImagingPartner(token, organizationId, view.attestation_code_required);
      setView(next);
      setMessage('Attestation recorded. Waiting for company acceptance if still pending.');
    } catch (err) {
      if (err instanceof RadiologyApiError) {
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
    return <LoadingState label="Checking imaging pack gates and partner eligibility…" />;
  }

  return (
    <div className="wp-stack">
      <Text tone="secondary">{view.sandbox_note}</Text>
      <Card>
        <Heading level={2}>Imaging capability</Heading>
        <Text>
          State <strong>{view.state}</strong> · Acceptance {view.acceptance} · booking=
          {String(view.booking_enabled)} · live_payout={String(view.live_payout)}
        </Text>
        <Text size="caption">
          Country {view.country_code ?? '—'} · Org {view.organization_status ?? '—'} · Pack published{' '}
          {view.pack.published ? 'yes' : 'no'}
        </Text>
        <Text size="caption">
          Gates: imaging_service={String(view.gates.imaging_service)} · imaging_type=
          {String(view.gates.imaging_partner_type)} · catalog_write={String(view.gates.catalog_write)} ·
          center={String(view.pack.imaging_center_enabled)}
        </Text>
        {view.blocked_reason ? <Text tone="secondary">{view.blocked_reason}</Text> : null}
        {view.next_action ? <Text>{view.next_action}</Text> : null}
        {view.state === 'REQUIRES_ATTESTATION' ? (
          <Button disabled={busy} onClick={() => void attest()}>
            Attest sandbox participation
          </Button>
        ) : null}
        {formError ? <Text tone="secondary">{formError}</Text> : null}
        {message ? <Text>{message}</Text> : null}
      </Card>
      {!view.gates.catalog_write ? (
        <EmptyState
          title="Catalog writes locked"
          description="Pack must enable imaging_center, IMAGING_CENTER partner type, attestation, and company acceptance before offering IMAGING_STUDY catalog items."
        />
      ) : null}
    </div>
  );
}

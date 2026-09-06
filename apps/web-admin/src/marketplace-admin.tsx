'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminRequestError } from './admin-request-error';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  Select,
} from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { gateRows, presentOrgPicks, type OrgPickRow } from './eligibility-admin-present';

type EligibilityView = {
  seller_org_id?: string;
  country_code?: string | null;
  state?: string;
  acceptance?: string;
  attested?: boolean;
  blocked_reason?: string | null;
  next_action?: string | null;
  sandbox_note?: string;
  live_payout?: boolean;
  organization_status?: string | null;
  gates?: Record<string, boolean>;
};

export function MarketplaceAdminPanel() {
  const { getAccessToken, session } = useSession();
  const [sellerOrgId, setSellerOrgId] = useState('');
  const [reason, setReason] = useState('');
  const [orgs, setOrgs] = useState<OrgPickRow[]>([]);
  const [view, setView] = useState<EligibilityView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadOrgs = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/governance/organizations`, {
      headers: adminAuthHeaders(token),
    });
    if (res.ok) {
      const rows = presentOrgPicks(await res.json(), ['VENDOR']);
      setOrgs(rows);
      setSellerOrgId((current) => current || rows[0]?.id || '');
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void loadOrgs();
    }
  }, [loadOrgs, session.audience, session.status]);

  async function load(id = sellerOrgId) {
    const token = getAccessToken();
    const seller = id.trim();
    if (!token || !seller) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(
      `${adminApiRoot()}/api/v1/admin/marketplace/eligibility?seller_org_id=${encodeURIComponent(seller)}`,
      { headers: adminAuthHeaders(token) },
    );
    setBusy(false);
    if (!res.ok) {
      setError('Eligibility could not be loaded.');
      setView(null);
      return;
    }
    setView((await res.json()) as EligibilityView);
  }

  async function act(action: 'accept' | 'block' | 'reset') {
    const token = getAccessToken();
    if (!token || !sellerOrgId.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/marketplace/acceptance`, {
      method: 'POST',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        seller_org_id: sellerOrgId.trim(),
        action,
        reason: reason.trim() || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      setError(body.detail ?? 'Acceptance update failed.');
      return;
    }
    setMessage(`Seller ${action}ed.`);
    setView((await res.json()) as EligibilityView);
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  const gates = gateRows(view?.gates);

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Marketplace eligibility</Heading>
        <p className="wp-page-intro">
          Evaluate and accept/block a seller org against `/admin/marketplace`. This is KYC eligibility, not storefront
          merchandising. Live payouts stay off.
        </p>
      </header>
      <div className="wp-toolbar">
        <FormField label="Seller organization">
          {({ id }) => (
            <Select
              id={id}
              aria-label="Seller organization id"
              value={sellerOrgId}
              onChange={(event) => setSellerOrgId(event.target.value)}
            >
              {orgs.length === 0 ? <option value="">No vendors loaded</option> : null}
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label="Block reason">
          {({ id }) => (
            <Input
              id={id}
              aria-label="Block reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </FormField>
        <Button onClick={() => void load()} disabled={busy || !sellerOrgId.trim()}>
          {busy ? 'Working…' : 'Load eligibility'}
        </Button>
        <Button variant="secondary" onClick={() => void act('accept')} disabled={busy || !sellerOrgId.trim()}>
          Accept
        </Button>
        <Button variant="secondary" onClick={() => void act('block')} disabled={busy || !sellerOrgId.trim()}>
          Block
        </Button>
        <Button variant="tertiary" onClick={() => void act('reset')} disabled={busy || !sellerOrgId.trim()}>
          Reset
        </Button>
      </div>
      {message ? <p className="wp-text-muted">{message}</p> : null}
      {orgs.length ? (
        <Card>
          <h2 className="wp-section-title">Vendor organizations</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>
                      <span className="wp-status">{row.status}</span>
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSellerOrgId(row.id);
                          void load(row.id);
                        }}
                      >
                        Select
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {view ? (
        <Card>
          <h2 className="wp-section-title">
            {view.state ?? 'UNKNOWN'} / {view.acceptance ?? 'NONE'}
          </h2>
          <p className="wp-list-meta">
            Country {view.country_code ?? '—'} · org {view.organization_status ?? '—'} · attested{' '}
            {view.attested ? 'yes' : 'no'} · live payout {view.live_payout ? 'on' : 'off'}
          </p>
          {view.blocked_reason ? <p className="wp-text-muted">{view.blocked_reason}</p> : null}
          {view.next_action ? <p className="wp-text-muted">{view.next_action}</p> : null}
          {view.sandbox_note ? <p className="wp-text-muted">{view.sandbox_note}</p> : null}
          {gates.length ? (
            <div className="wp-admin-table-wrap">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th>Gate</th>
                    <th>Pass</th>
                  </tr>
                </thead>
                <tbody>
                  {gates.map((row) => (
                    <tr key={row.key}>
                      <td>{row.key.replaceAll('_', ' ')}</td>
                      <td>{row.ok ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      ) : (
        <EmptyState title="No seller loaded" description="Pick a vendor, then Load eligibility." />
      )}
    </section>
  );
}

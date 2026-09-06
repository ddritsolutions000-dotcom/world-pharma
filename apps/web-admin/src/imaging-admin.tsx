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
  imaging_org_id?: string;
  country_code?: string | null;
  state?: string;
  acceptance?: string;
  attested?: boolean;
  blocked_reason?: string | null;
  next_action?: string | null;
  sandbox_note?: string;
  booking_enabled?: boolean;
  live_payout?: boolean;
  organization_status?: string | null;
  gates?: Record<string, boolean>;
};

type ReportRow = {
  id: string;
  accession_number?: string | null;
  status?: string | null;
  version_number?: number | null;
  published_at?: string | null;
};

type PhysicalRow = {
  id: string;
  status?: string;
  sealed_package_id?: string | null;
  created_at?: string;
};

type LocationRow = {
  id: string;
  name: string;
  city?: string | null;
  is_active?: boolean;
  country_code?: string;
};

type StudyRow = {
  id: string;
  accession_number?: string;
  status?: string;
  modality_code?: string | null;
  equipment_code?: string | null;
  acquisition_status?: string | null;
  location?: { name?: string };
};

type EquipmentRow = {
  equipment_code: string;
  modality_code?: string | null;
  last_status?: string;
  integration?: string;
};

type BookingSummary = {
  bookings_total?: number;
  bookings_confirmed?: number;
  active_studies?: number;
  active_locations?: number;
  scheduling_capacity_note?: string;
};

export function ImagingAdminPanel() {
  const { getAccessToken, session } = useSession();
  const [orgId, setOrgId] = useState('');
  const [reason, setReason] = useState('');
  const [orgs, setOrgs] = useState<OrgPickRow[]>([]);
  const [view, setView] = useState<EligibilityView | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [physical, setPhysical] = useState<PhysicalRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [studies, setStudies] = useState<StudyRow[]>([]);
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [summary, setSummary] = useState<BookingSummary | null>(null);
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
      const rows = presentOrgPicks(await res.json(), ['IMAGING_CENTER']);
      setOrgs(rows);
      setOrgId((current) => current || rows[0]?.id || '');
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void loadOrgs();
    }
  }, [loadOrgs, session.audience, session.status]);

  async function load(id = orgId) {
    const token = getAccessToken();
    const imaging = id.trim();
    if (!token || !imaging) {
      return;
    }
    setBusy(true);
    setError(null);
    const q = encodeURIComponent(imaging);
    const headers = adminAuthHeaders(token);
    const [elig, reportRes, physicalRes, locRes, studyRes, equipRes, summaryRes] = await Promise.all([
      fetch(`${adminApiRoot()}/api/v1/admin/imaging/eligibility?imaging_org_id=${q}`, { headers }),
      fetch(`${adminApiRoot()}/api/v1/admin/imaging/reports?imaging_org_id=${q}`, { headers }),
      fetch(`${adminApiRoot()}/api/v1/admin/imaging/physical-reports?imaging_org_id=${q}`, { headers }),
      fetch(`${adminApiRoot()}/api/v1/admin/imaging/locations?imaging_org_id=${q}`, { headers }),
      fetch(`${adminApiRoot()}/api/v1/admin/imaging/studies?imaging_org_id=${q}`, { headers }),
      fetch(`${adminApiRoot()}/api/v1/admin/imaging/equipment?imaging_org_id=${q}`, { headers }),
      fetch(`${adminApiRoot()}/api/v1/admin/imaging/booking-summary?imaging_org_id=${q}`, { headers }),
    ]);
    setBusy(false);
    if (!elig.ok) {
      setError('Imaging eligibility could not be loaded.');
      setView(null);
      return;
    }
    setView((await elig.json()) as EligibilityView);
    if (reportRes.ok) {
      const body = (await reportRes.json()) as { data?: ReportRow[] };
      setReports(body.data ?? []);
    }
    if (physicalRes.ok) {
      const body = (await physicalRes.json()) as { data?: PhysicalRow[] };
      setPhysical(body.data ?? []);
    }
    if (locRes.ok) {
      const body = (await locRes.json()) as { data?: LocationRow[] };
      setLocations(body.data ?? []);
    }
    if (studyRes.ok) {
      const body = (await studyRes.json()) as { data?: StudyRow[] };
      setStudies(body.data ?? []);
    }
    if (equipRes.ok) {
      const body = (await equipRes.json()) as { data?: EquipmentRow[] };
      setEquipment(body.data ?? []);
    }
    if (summaryRes.ok) {
      setSummary((await summaryRes.json()) as BookingSummary);
    }
  }

  async function act(action: 'accept' | 'block' | 'reset') {
    const token = getAccessToken();
    if (!token || !orgId.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/imaging/acceptance`, {
      method: 'POST',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        imaging_org_id: orgId.trim(),
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
    setMessage(`Imaging org ${action}ed.`);
    setView((await res.json()) as EligibilityView);
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  const gates = gateRows(view?.gates);

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Imaging partners</Heading>
        <p className="wp-page-intro">
          Eligibility, acceptance, and report metadata from `/admin/imaging`. Interpretation UI stays on the radiology
          portal. No clinical editing here.
        </p>
      </header>
      <div className="wp-toolbar">
        <FormField label="Imaging center">
          {({ id }) => (
            <Select
              id={id}
              aria-label="Imaging organization id"
              value={orgId}
              onChange={(event) => setOrgId(event.target.value)}
            >
              {orgs.length === 0 ? <option value="">No imaging centers loaded</option> : null}
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
            <Input id={id} aria-label="Block reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          )}
        </FormField>
        <Button onClick={() => void load()} disabled={busy || !orgId.trim()}>
          {busy ? 'Working…' : 'Load imaging'}
        </Button>
        <Button variant="secondary" onClick={() => void act('accept')} disabled={busy || !orgId.trim()}>
          Accept
        </Button>
        <Button variant="secondary" onClick={() => void act('block')} disabled={busy || !orgId.trim()}>
          Block
        </Button>
        <Button variant="tertiary" onClick={() => void act('reset')} disabled={busy || !orgId.trim()}>
          Reset
        </Button>
      </div>
      {message ? <p className="wp-text-muted">{message}</p> : null}
      {orgs.length ? (
        <Card>
          <h2 className="wp-section-title">Imaging centers</h2>
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
                          setOrgId(row.id);
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
            Country {view.country_code ?? '—'} · booking {view.booking_enabled ? 'on' : 'off'} · live payout{' '}
            {view.live_payout ? 'on' : 'off'}
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
        <EmptyState title="No imaging org loaded" description="Pick an imaging center, then Load imaging." />
      )}
      {reports.length ? (
        <Card>
          <h2 className="wp-section-title">Report metadata</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Accession</th>
                  <th>Status</th>
                  <th>Version</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((row) => (
                  <tr key={row.id}>
                    <td>{row.accession_number ?? '—'}</td>
                    <td>
                      <span className="wp-status">{row.status ?? '—'}</span>
                    </td>
                    <td>{row.version_number ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {physical.length ? (
        <Card>
          <h2 className="wp-section-title">Physical report jobs</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Sealed package</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {physical.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="wp-status">{row.status ?? '—'}</span>
                    </td>
                    <td>{row.sealed_package_id ? `${row.sealed_package_id.slice(0, 8)}…` : '—'}</td>
                    <td>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {summary ? (
        <Card>
          <h2 className="wp-section-title">Scheduling & capacity</h2>
          <p className="wp-list-meta">
            Bookings {summary.bookings_total ?? 0} · confirmed {summary.bookings_confirmed ?? 0} · active studies{' '}
            {summary.active_studies ?? 0} · locations {summary.active_locations ?? 0}
          </p>
          {summary.scheduling_capacity_note ? <p className="wp-text-muted">{summary.scheduling_capacity_note}</p> : null}
        </Card>
      ) : null}
      {locations.length ? (
        <Card>
          <h2 className="wp-section-title">Imaging facilities</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>City</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.city ?? '—'}</td>
                    <td>{row.is_active ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {equipment.length ? (
        <Card>
          <h2 className="wp-section-title">Equipment & modalities</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Modality</th>
                  <th>Last status</th>
                  <th>Integration</th>
                </tr>
              </thead>
              <tbody>
                {equipment.map((row) => (
                  <tr key={row.equipment_code}>
                    <td>{row.equipment_code}</td>
                    <td>{row.modality_code ?? '—'}</td>
                    <td>{row.last_status ?? '—'}</td>
                    <td>{row.integration ?? 'sandbox'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {studies.length ? (
        <Card>
          <h2 className="wp-section-title">Studies pipeline</h2>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Accession</th>
                  <th>Status</th>
                  <th>Modality</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {studies.map((row) => (
                  <tr key={row.id}>
                    <td>{row.accession_number ?? row.id.slice(0, 8)}</td>
                    <td>{row.status ?? '—'}</td>
                    <td>{row.modality_code ?? '—'}</td>
                    <td>{row.location?.name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </section>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, FormField, Heading, Input, Select } from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import {
  gateRows,
  presentMembershipPeople,
  presentOrgPicks,
  type OrgPickRow,
  type PersonPickRow,
} from './eligibility-admin-present';

type CollectionRow = {
  id: string;
  status?: string;
  test_title?: string;
  assignee_person_id?: string | null;
};

export function LabOpsAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [orgs, setOrgs] = useState<OrgPickRow[]>([]);
  const [people, setPeople] = useState<PersonPickRow[]>([]);
  const [labOrgId, setLabOrgId] = useState('');
  const [sampleId, setSampleId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [state, setState] = useState<string | null>(null);
  const [gates, setGates] = useState<Array<{ key: string; ok: boolean }>>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [reports, setReports] = useState<Array<{ id: string; accession_number?: string; status?: string | null }>>([]);
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
    if (!res.ok) {
      return;
    }
    const rows = presentOrgPicks(await res.json(), ['LAB']);
    setOrgs(rows);
    setLabOrgId((current) => current || rows[0]?.id || '');
  }, [getAccessToken]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void loadOrgs();
    }
  }, [loadOrgs, session.audience, session.status]);

  useEffect(() => {
    const token = getAccessToken();
    const org = labOrgId.trim();
    if (!token || !org) {
      setPeople([]);
      return;
    }
    void fetch(
      `${adminApiRoot()}/api/v1/admin/governance/memberships?organization_id=${encodeURIComponent(org)}`,
      { headers: adminAuthHeaders(token) },
    ).then(async (res) => {
      if (!res.ok) {
        setPeople([]);
        return;
      }
      const rows = presentMembershipPeople(await res.json());
      setPeople(rows);
      setAssigneeId((current) => current || rows[0]?.id || '');
    });
  }, [getAccessToken, labOrgId]);

  async function load() {
    const token = getAccessToken();
    const org = labOrgId.trim();
    if (!token || !org) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const q = encodeURIComponent(org);
    const headers = adminAuthHeaders(token);
    const [elig, col, rep] = await Promise.all([
      fetch(`${adminApiRoot()}/api/v1/admin/lab/eligibility?lab_org_id=${q}`, { headers }),
      fetch(`${adminApiRoot()}/api/v1/admin/lab/collections?lab_org_id=${q}`, { headers }),
      fetch(`${adminApiRoot()}/api/v1/admin/lab/reports?lab_org_id=${q}`, { headers }),
    ]);
    setBusy(false);
    if (elig.ok) {
      const body = (await elig.json()) as { state?: string; gates?: Record<string, boolean> };
      setState(body.state ?? null);
      setGates(gateRows(body.gates));
    }
    if (col.ok) {
      const body = (await col.json()) as { data?: CollectionRow[] };
      const next = body.data ?? [];
      setCollections(next);
      setSampleId((current) => (current && next.some((row) => row.id === current) ? current : next[0]?.id ?? ''));
    }
    if (rep.ok) {
      const body = (await rep.json()) as { data?: Array<{ id: string; accession_number?: string; status?: string | null }> };
      setReports(body.data ?? []);
    }
    if (!elig.ok && !col.ok) {
      setMessage('Lab ops load failed. partner:manage required.');
    }
  }

  async function assign() {
    const token = getAccessToken();
    if (!token || !labOrgId.trim() || !sampleId.trim() || !assigneeId.trim()) {
      return;
    }
    setBusy(true);
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/lab/collections/assign`, {
      method: 'POST',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        lab_org_id: labOrgId.trim(),
        lab_sample_id: sampleId.trim(),
        assignee_person_id: assigneeId.trim(),
      }),
    });
    setBusy(false);
    setMessage(res.ok ? 'Phlebotomist assigned.' : 'Assign failed.');
    if (res.ok) {
      await load();
    }
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section className="wp-stack">
      <Heading level={2}>Home collection &amp; reports</Heading>
      <p className="wp-page-intro">
        Phlebotomy queue, eligibility gates, and report metadata. No clinical result editing.
      </p>
      <Card>
        <FormField label="Lab organization">
          {({ id }) => (
            <Select
              id={id}
              aria-label="Lab organization id"
              value={labOrgId}
              onChange={(e) => setLabOrgId(e.target.value)}
            >
              {orgs.length === 0 ? <option value="">No lab orgs loaded</option> : null}
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <Button onClick={() => void load()} disabled={busy || !labOrgId.trim()}>
          Load lab ops
        </Button>
        {state ? (
          <p className="wp-list-meta">
            Eligibility <span className="wp-status">{state}</span>
          </p>
        ) : null}
        {gates.length ? (
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
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
      {collections.length ? (
        <Card>
          <h3 className="wp-section-title">Collections</h3>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Status</th>
                  <th>Assignee</th>
                  <th>Sample</th>
                </tr>
              </thead>
              <tbody>
                {collections.map((row) => (
                  <tr key={row.id}>
                    <td>{row.test_title ?? '—'}</td>
                    <td>
                      <span className="wp-status">{row.status ?? '—'}</span>
                    </td>
                    <td>{row.assignee_person_id ? `${row.assignee_person_id.slice(0, 8)}…` : 'Unassigned'}</td>
                    <td>
                      <code>{row.id.slice(0, 8)}…</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <FormField label="Sample">
            {({ id }) => (
              <Select
                id={id}
                aria-label="Lab sample id"
                value={sampleId}
                onChange={(e) => setSampleId(e.target.value)}
              >
                {collections.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.test_title ?? row.id.slice(0, 8)} · {row.status ?? 'open'}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <FormField label="Phlebotomist">
            {({ id }) =>
              people.length ? (
                <Select
                  id={id}
                  aria-label="Phlebotomist person id"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                >
                  {people.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={id}
                  aria-label="Phlebotomist person id"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                />
              )
            }
          </FormField>
          <Button onClick={() => void assign()} disabled={busy || !sampleId.trim() || !assigneeId.trim()}>
            Assign collection
          </Button>
        </Card>
      ) : null}
      {reports.length ? (
        <Card>
          <h3 className="wp-section-title">Report metadata</h3>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Accession</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((row) => (
                  <tr key={row.id}>
                    <td>{row.accession_number ?? '—'}</td>
                    <td>
                      <span className="wp-status">{row.status ?? '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {message ? <p className="wp-text-muted">{message}</p> : null}
    </section>
  );
}

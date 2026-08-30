'use client';

import { useState } from 'react';
import { apiBaseUrl } from '@world-pharma/shell-core';
import { useSession } from '@world-pharma/shell-web';
import { Button, Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';

type PrescriptionAdminRow = {
  id: string;
  status: string;
  country_id?: string;
  encounter_id?: string | null;
  doctor_profile_id?: string;
  origin?: string;
  created_at?: string;
  note?: string;
};

type PrescriptionAdminDetail = PrescriptionAdminRow & {
  current_version_id?: string | null;
  versions?: Array<{ id: string; version_number: number; sealed_at?: string | null; created_at?: string }>;
  status_history?: Array<{
    from_status: string | null;
    to_status: string;
    reason_code?: string | null;
    created_at: string;
  }>;
};

type DispensingAdminCase = {
  id: string;
  status: string;
  prescription_id: string;
  prescription_version_id?: string;
  country_id?: string;
  organization_id?: string | null;
  location_id?: string | null;
  order_id?: string | null;
  created_at?: string;
  updated_at?: string;
  note?: string;
};

type AdminRefillRequestRow = {
  id: string;
  prescription_id: string;
  status: string;
  customer_person_id?: string;
  dispensing_case_id?: string | null;
  created_at?: string;
};

function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function PrescriptionsAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<PrescriptionAdminRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PrescriptionAdminDetail | null>(null);
  const [dispensingCases, setDispensingCases] = useState<DispensingAdminCase[] | null>(null);
  const [refillRequests, setRefillRequests] = useState<AdminRefillRequestRow[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);

  async function loadList() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoadError(false);
    setDenied(false);
    const res = await fetch(`${apiBaseUrl()}/api/v1/admin/prescriptions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setLoadError(true);
      return;
    }
    const body = (await res.json()) as { prescriptions?: PrescriptionAdminRow[] };
    setRows(body.prescriptions ?? []);
  }

  async function loadDispensingCases() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoadError(false);
    setDenied(false);
    const res = await fetch(`${apiBaseUrl()}/api/v1/admin/dispensing-cases`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setLoadError(true);
      return;
    }
    const body = (await res.json()) as { cases?: DispensingAdminCase[] };
    setDispensingCases(body.cases ?? []);
  }

  async function loadRefillRequests() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoadError(false);
    setDenied(false);
    const res = await fetch(`${apiBaseUrl()}/api/v1/admin/refill-requests`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setLoadError(true);
      return;
    }
    const body = (await res.json()) as { requests?: AdminRefillRequestRow[] };
    setRefillRequests(body.requests ?? []);
  }

  async function loadDetail(id: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setSelectedId(id);
    setDetail(null);
    const res = await fetch(`${apiBaseUrl()}/api/v1/admin/prescriptions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 403) {
      setDenied(true);
      return;
    }
    if (!res.ok) {
      setLoadError(true);
      return;
    }
    setDetail((await res.json()) as PrescriptionAdminDetail);
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  return (
    <section>
      <Heading level={2}>Prescriptions</Heading>
      <Text tone="secondary">
        Operational metadata only. Medication lines and dosage instructions are not exposed on admin views.
      </Text>
      <Button onClick={() => void loadList()}>Load prescriptions</Button>
      <Button variant="secondary" onClick={() => void loadDispensingCases()}>
        Load dispensing cases
      </Button>
      <Button variant="secondary" onClick={() => void loadRefillRequests()}>
        Load refill requests
      </Button>
      {denied ? <EmptyState title="Permission denied" description="Requires prescription:read." /> : null}
      {loadError ? (
        <EmptyState title="Unable to load" description="Check network and try again." />
      ) : null}
      {rows ? (
        <Card>
          <Text>{rows.length} prescription(s)</Text>
          {rows.map((row) => (
            <div key={row.id} style={{ marginTop: 8 }}>
              <Text>{`${truncateId(row.id)} · ${row.status} · ${row.origin ?? '—'}`}</Text>
              <Text size="caption" tone="secondary">
                {`Encounter ${row.encounter_id ? truncateId(row.encounter_id) : '—'} · ${row.created_at ?? ''}`}
              </Text>
              <Button variant="secondary" size="sm" onClick={() => void loadDetail(row.id)}>
                View detail
              </Button>
            </div>
          ))}
        </Card>
      ) : null}
      {selectedId && detail ? (
        <Card>
          <Heading level={3}>Prescription detail</Heading>
          <Text>{`Status: ${detail.status}`}</Text>
          <Text size="caption">{`Origin: ${detail.origin ?? '—'}`}</Text>
          <Text size="caption">{`Versions: ${detail.versions?.length ?? 0}`}</Text>
          <Text size="caption">{`Created: ${detail.created_at ?? '—'}`}</Text>
          {detail.status_history?.length ? (
            <>
              <Text size="caption">Status audit trail</Text>
              {detail.status_history.map((row, index) => (
                <Text key={`${row.to_status}-${row.created_at}-${index}`} size="caption" tone="secondary">
                  {`${row.from_status ?? '—'} → ${row.to_status}${row.reason_code ? ` (${row.reason_code})` : ''} · ${row.created_at}`}
                </Text>
              ))}
            </>
          ) : null}
          {detail.note ? (
            <Text size="caption" tone="secondary">
              {detail.note}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {refillRequests ? (
        <Card>
          <Heading level={3}>Refill requests</Heading>
          <Text tone="secondary">Operational metadata only (ids and status).</Text>
          <Text>{refillRequests.length} request(s)</Text>
          {!refillRequests.length ? (
            <EmptyState title="No refill requests" description="Patient refill workflow requests appear here." />
          ) : (
            refillRequests.map((row) => (
              <div key={row.id} style={{ marginTop: 8 }}>
                <Text>{`${truncateId(row.id)} · ${row.status}`}</Text>
                <Text size="caption" tone="secondary">
                  {`Rx ${truncateId(row.prescription_id)} · case ${row.dispensing_case_id ? truncateId(row.dispensing_case_id) : '—'} · ${row.created_at ?? ''}`}
                </Text>
              </div>
            ))
          )}
        </Card>
      ) : null}

      {dispensingCases ? (
        <Card>
          <Heading level={3}>Dispensing cases</Heading>
          <Text tone="secondary">Operational metadata only. Medication lines are not exposed.</Text>
          <Heading level={4}>Commerce handoff</Heading>
          <Text size="caption" tone="secondary">
            Linked order IDs when patients complete Order-from-Rx (IDs only, no PHI).
          </Text>
          <Text>{dispensingCases.length} case(s)</Text>
          {!dispensingCases.length ? (
            <EmptyState title="No dispensing cases" description="Queued or claimed pharmacy cases appear here." />
          ) : (
            dispensingCases.map((row) => (
              <div key={row.id} style={{ marginTop: 8 }}>
                <Text>{`${truncateId(row.id)} · ${row.status}`}</Text>
                <Text size="caption" tone="secondary">
                  {`Rx ${truncateId(row.prescription_id)} · order ${row.order_id ? truncateId(row.order_id) : '—'} · org ${row.organization_id ? truncateId(row.organization_id) : '—'} · ${row.created_at ?? ''}`}
                </Text>
              </div>
            ))
          )}
        </Card>
      ) : null}
    </section>
  );
}

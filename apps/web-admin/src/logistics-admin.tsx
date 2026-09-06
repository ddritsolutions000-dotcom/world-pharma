'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { formatMoney } from './format-money';
import { presentPartnerPeople, type PersonPickRow } from './eligibility-admin-present';
import { shipmentStatusLabel } from './shipment-status-labels';

type ShipmentRow = {
  id: string;
  status: string;
  tracking_number?: string;
  carrier?: string;
  carrier_name?: string;
  quoted_cost_minor?: string | null;
  actual_cost_minor?: string | null;
  currency?: string;
};

type CarrierOption = {
  code: string;
  name: string;
  priority: number;
};

type ProductionLogisticsAvailability = {
  country_code: string;
  available: boolean;
  environment: string;
  live_logistics_enabled: boolean;
  country_production_lifecycle: string;
  external_gate: string;
  serviceability_ready: boolean;
  carrier_dependency: {
    present: boolean;
    status: string | null;
    provider_identifier: string | null;
    external_gated: boolean;
  };
  blockers: string[];
  message: string;
};

type LogisticsSnapshot = {
  environment: string;
  live_logistics_enabled: boolean;
  counts: Record<string, number>;
};

type LogisticsExceptions = {
  recon: Array<{ id: string; break_type: string; shipment_status?: string }>;
  unknown_webhooks: Array<{ id: string; occurrence_key: string }>;
  stuck: Array<{ id: string; status: string }>;
};

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

export function LogisticsAdminPanel() {
  const { session, getAccessToken } = useSession();
  const [rows, setRows] = useState<ShipmentRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [riders, setRiders] = useState<PersonPickRow[]>([]);
  const [carriers, setCarriers] = useState<CarrierOption[]>([]);
  const [selectedCarrier, setSelectedCarrier] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [gateCountry, setGateCountry] = useState('');
  const [productionGate, setProductionGate] = useState<ProductionLogisticsAvailability | null>(null);
  const [snapshot, setSnapshot] = useState<LogisticsSnapshot | null>(null);
  const [exceptions, setExceptions] = useState<LogisticsExceptions | null>(null);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const body = await adminCall('/api/v1/admin/shipments', token);
      setRows((body.data ?? []) as ShipmentRow[]);
      setDenied(false);
      try {
        const carrierBody = await adminCall('/api/v1/admin/shipments/carriers', token);
        const carrierRows = (carrierBody.data ?? []) as CarrierOption[];
        setCarriers(carrierRows);
        setSelectedCarrier((current) => current || carrierRows.find((row) => row.code === 'MOCK')?.code || carrierRows[0]?.code || '');
      } catch {
        setCarriers([]);
      }
      try {
        const snap = await adminCall('/api/v1/admin/shipments/snapshot', token);
        setSnapshot(snap as LogisticsSnapshot);
      } catch {
        setSnapshot(null);
      }
      try {
        const ex = await adminCall('/api/v1/admin/shipments/exceptions', token);
        setExceptions(ex as LogisticsExceptions);
      } catch {
        setExceptions(null);
      }
      const scope = (gateCountry || session.countryCode || '').trim().toUpperCase();
      if (scope) {
        try {
          const gate = await adminCall(
            `/api/v1/admin/shipments/production-availability?country_code=${encodeURIComponent(scope)}`,
            token,
          );
          setProductionGate(gate as ProductionLogisticsAvailability);
        } catch {
          setProductionGate(null);
        }
      }
      try {
        const partners = await adminCall('/api/v1/admin/partners/applications', token);
        const next = presentPartnerPeople(partners, ['DELIVERY_PARTNER']);
        setRiders(next);
        setAssigneeId((current) => current || next[0]?.id || '');
      } catch {
        setRiders([]);
      }
    } catch (err) {
      if ((err as { status?: number }).status === 403) {
        setDenied(true);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [gateCountry, getAccessToken, session.countryCode]);

  useEffect(() => {
    if (session.status === 'authenticated' && session.audience === 'admin') {
      void load();
    }
  }, [load, session.audience, session.status]);

  useEffect(() => {
    if (!selectedId && rows[0]) {
      setSelectedId(rows[0].id);
    }
  }, [rows, selectedId]);

  async function runAction(label: string, path: string, init?: RequestInit, shipmentId?: string) {
    const token = getAccessToken();
    const targetId = shipmentId ?? selectedId;
    if (!token || !targetId) {
      return;
    }
    setSelectedId(targetId);
    setMessage(null);
    try {
      await adminCall(path, token, init);
      setMessage(`${label} completed.`);
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function bookShipment(shipmentId: string) {
    await runAction('Book', `/api/v1/admin/shipments/${shipmentId}/book`, {
      method: 'POST',
      body: JSON.stringify({ scenario: 'BOOK_SUCCESS', carrier_code: selectedCarrier }),
    }, shipmentId);
  }

  if (session.status !== 'authenticated' || session.audience !== 'admin') {
    return null;
  }

  if (denied) {
    return <PermissionDeniedState />;
  }

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Logistics</Heading>
        <p className="wp-page-intro">
          Book sandbox shipments after an order is packed. Live carrier/fleet APIs stay external-gated until a verified
          production carrier dependency exists. Production booking never falls back to the mock adapter.
        </p>
      </header>
      <Card>
        <h2 className="wp-section-title">Production logistics rail</h2>
        <FormField label="Country (ISO)">
          {({ id }) => (
            <Input
              id={id}
              value={gateCountry}
              onChange={(e) => setGateCountry(e.target.value.toUpperCase())}
              placeholder="Country code"
            />
          )}
        </FormField>
        <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
          Refresh production gate
        </Button>
        {productionGate ? (
          <>
            <Text tone="secondary">
              {productionGate.country_code} · lifecycle {productionGate.country_production_lifecycle} · env{' '}
              {productionGate.environment} · {productionGate.available ? 'available' : 'blocked'} · external{' '}
              {productionGate.external_gate}
            </Text>
            <Text size="caption">
              Carrier dep {productionGate.carrier_dependency.present ? productionGate.carrier_dependency.status : 'missing'}{' '}
              · serviceability {productionGate.serviceability_ready ? 'ready' : 'not ready'}
            </Text>
            <Text size="caption">{productionGate.message}</Text>
            {productionGate.blockers.length ? (
              <ul className="wp-mini-list">
                {productionGate.blockers.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <Text size="caption">Enter a country code to inspect the production logistics gate.</Text>
        )}
        {snapshot ? (
          <Text size="caption">
            Runtime {snapshot.environment}
            {snapshot.counts
              ? ` · pickup ${snapshot.counts.PICKUP_SCHEDULED ?? 0} · in transit ${snapshot.counts.IN_TRANSIT ?? 0} · OFD ${snapshot.counts.OUT_FOR_DELIVERY ?? 0} · delivered ${snapshot.counts.DELIVERED ?? 0} · failed ${snapshot.counts.DELIVERY_FAILED ?? 0} · RTO ${snapshot.counts.RETURN_TO_ORIGIN ?? 0}`
              : ''}
          </Text>
        ) : null}
        {exceptions ? (
          <Text size="caption">
            Exceptions: recon {exceptions.recon.length} · unknown webhooks {exceptions.unknown_webhooks.length} · stuck{' '}
            {exceptions.stuck.length}
          </Text>
        ) : null}
      </Card>
      <div className="wp-toolbar">
        <FormField label="Shipping carrier">
          {({ id }) => (
            <Select id={id} value={selectedCarrier} onChange={(e) => setSelectedCarrier(e.target.value)}>
              {carriers.length ? (
                carriers.map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.name}
                  </option>
                ))
              ) : (
                <option value="MOCK">Sandbox mock carrier</option>
              )}
            </Select>
          )}
        </FormField>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh shipments'}
        </Button>
      </div>
      {loading && rows.length === 0 ? <LoadingState label="Loading shipments" /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}
      {!rows.length && !loading && !error ? (
        <EmptyState
          title="No shipments"
          description="Pack an order on the Orders page first. Then book the shipment here."
        />
      ) : null}

      {rows.length ? (
        <div className="wp-order-layout">
        <div className="wp-admin-table-wrap">
          <table className="wp-table">
            <thead>
              <tr>
                <th>Tracking</th>
                <th>Carrier</th>
                <th>Status</th>
                <th>Quoted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={selectedId === row.id ? 'wp-admin-row-active' : undefined}>
                  <td>{row.tracking_number ?? row.id.slice(0, 8)}</td>
                  <td>{row.carrier_name ?? row.carrier ?? '—'}</td>
                  <td>
                    <span className="wp-status">{shipmentStatusLabel(row.status)}</span>
                  </td>
                  <td>
                    {row.quoted_cost_minor ? formatMoney(row.quoted_cost_minor, row.currency ?? 'XXX') : '—'}
                  </td>
                  <td>
                    <div className="wp-row-actions">
                    <Button
                      size="sm"
                      onClick={() => void bookShipment(row.id)}
                    >
                      Book
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void runAction('Reconcile', `/api/v1/admin/shipments/${row.id}/reconcile`, { method: 'POST' }, row.id)
                      }
                    >
                      Reconcile
                    </Button>
                    <Button
                      size="sm"
                      variant={selectedId === row.id ? 'primary' : 'tertiary'}
                      onClick={() => setSelectedId(row.id)}
                    >
                      More
                    </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected ? (
        <Card className="wp-order-detail">
          <h2 className="wp-section-title">Shipment {selected.id.slice(0, 8)}</h2>
          <span className="wp-status">{shipmentStatusLabel(selected.status)}</span>
          <Text tone="secondary">
            Carrier: {selected.carrier_name ?? selected.carrier ?? 'Not booked'} · Book with {selectedCarrier} from the
            toolbar above.
          </Text>
          <p className="wp-text-muted">Return-to-origin, OTP proof of delivery, and rider assignment.</p>
          <div className="wp-form-grid">
          <FormField label="Book with carrier">
            {({ id }) => (
              <Select id={id} value={selectedCarrier} onChange={(e) => setSelectedCarrier(e.target.value)}>
                {(carriers.length ? carriers : [{ code: 'MOCK', name: 'Sandbox mock carrier', priority: 90 }]).map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
          <div className="wp-form-actions">
            <Button size="sm" onClick={() => void bookShipment(selected.id)}>
              Book shipment
            </Button>
          </div>
          <FormField label="OTP verify code">
            {({ id }) => <Input id={id} value={otpCode} onChange={(e) => setOtpCode(e.target.value)} />}
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
          <div className="wp-form-actions">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void runAction('Cancel', `/api/v1/admin/shipments/${selected.id}/cancel`, { method: 'POST' })}
            >
              Cancel shipment
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void runAction('RTO', `/api/v1/admin/shipments/${selected.id}/rto`, { method: 'POST' })}
            >
              Return to origin
            </Button>
            <Button
              size="sm"
              variant="tertiary"
              onClick={() =>
                void runAction('Create OTP', `/api/v1/admin/shipments/${selected.id}/otp`, { method: 'POST' })
              }
            >
              Create OTP POD
            </Button>
            <Button
              size="sm"
              variant="tertiary"
              onClick={() =>
                void runAction('Verify OTP', `/api/v1/admin/shipments/${selected.id}/otp/verify`, {
                  method: 'POST',
                  body: JSON.stringify({ code: otpCode }),
                })
              }
            >
              Verify OTP
            </Button>
            <Button
              size="sm"
              onClick={() =>
                void runAction('Assign job', '/api/v1/admin/delivery/jobs/assign', {
                  method: 'POST',
                  body: JSON.stringify({ shipment_id: selected.id, assignee_id: assigneeId }),
                })
              }
            >
              Assign delivery job
            </Button>
          </div>
          </div>
          {message ? <p className="wp-text-muted">{message}</p> : null}
        </Card>
        ) : null}
        </div>
      ) : null}
    </section>
  );
}

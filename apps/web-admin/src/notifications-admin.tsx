'use client';

import Link from 'next/link';
import { AdminRequestError } from './admin-request-error';
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  Switch,
  Select,
  TextArea,
} from '@world-pharma/ui-kit/web';
import { adminApiRoot, adminAuthHeaders } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { listCrmCustomers, type CrmCustomerSummary } from './crm-api';
import { workingCountry } from './working-country';
import { NotificationProviderMatrixPanel } from './notification-provider-matrix';

type InboxItem = {
  id: string;
  title?: string;
  body?: string;
  read?: boolean;
  created_at?: string;
  delivery_status?: string;
};
type Prefs = {
  email_enabled?: boolean;
  push_enabled?: boolean;
  sms_enabled?: boolean;
  marketing?: boolean;
  order_updates?: boolean;
};

type OpsSnapshot = {
  volume?: number;
  sandbox_delivered?: number;
  external_gated_count?: number;
  failed?: number;
  live_delivery?: boolean;
  by_status?: Record<string, number>;
  by_channel?: Record<string, number>;
  outbox?: {
    pending?: number;
    failed?: number;
    dead_lettered?: number;
    published_24h?: number;
  };
  channels?: Record<string, { sandbox?: boolean; production?: boolean; external_gate?: string | null }>;
  production_gates?: {
    otp?: {
      available?: boolean;
      blockers?: string[];
      message?: string;
      never_fallback_to_mock?: boolean;
    } | null;
    messaging?: {
      available?: boolean;
      blockers?: string[];
      message?: string;
    } | null;
    never_fallback_to_mock?: boolean;
  };
};

type OtpChallengeRow = {
  id: string;
  purpose?: string;
  channel?: string;
  status?: string;
  masked_recipient?: string;
  attempt_count?: number;
  max_attempts?: number;
  expires_at?: string;
  consumed_at?: string | null;
  provider_status?: string;
};

type OpsRecord = {
  id: string;
  title?: string;
  status?: string;
  channel?: string;
  event_type?: string | null;
  recipient_category?: string;
  country_code?: string | null;
  correlation_id?: string | null;
  created_at?: string;
  sandbox?: boolean;
  external_gated?: boolean;
  live_delivery?: boolean;
};

type DeadLetter = {
  id: string;
  event_type?: string;
  status?: string;
  attempts?: number;
  failure_reason?: string | null;
  correlation_id?: string | null;
  country_code?: string | null;
  failed_at?: string | null;
};

export function NotificationsAdminPanel() {
  const { getAccessToken, session } = useSession();
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [prefs, setPrefs] = useState<Prefs>({});
  const [targetPerson, setTargetPerson] = useState('');
  const [sendTitle, setSendTitle] = useState('');
  const [sendBody, setSendBody] = useState('');
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [customers, setCustomers] = useState<CrmCustomerSummary[]>([]);
  const [ops, setOps] = useState<OpsSnapshot | null>(null);
  const [records, setRecords] = useState<OpsRecord[]>([]);
  const [deadLetters, setDeadLetters] = useState<DeadLetter[]>([]);
  const [otpChallenges, setOtpChallenges] = useState<OtpChallengeRow[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterChannel, setFilterChannel] = useState('');
  const [filterEvent, setFilterEvent] = useState('');
  const [filterRecipient, setFilterRecipient] = useState('');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setLoading(true);
    setError(false);
    const headers = adminAuthHeaders(token);
    const root = adminApiRoot();
    const country = workingCountry(session.countryCode);
    const qs = new URLSearchParams();
    if (country) qs.set('country_code', country);
    if (filterStatus) qs.set('status', filterStatus);
    if (filterChannel) qs.set('channel', filterChannel);
    if (filterEvent) qs.set('event_type', filterEvent);
    if (filterRecipient) qs.set('recipient_category', filterRecipient);
    const query = qs.toString();

    const [inboxRes, prefRes, snapRes, recRes, dlqRes, otpRes] = await Promise.all([
      fetch(`${root}/api/v1/me/notifications/inbox`, { headers }),
      fetch(`${root}/api/v1/me/notifications/preferences`, { headers }),
      fetch(`${root}/api/v1/admin/notifications/ops/snapshot?country_code=${encodeURIComponent(country || '')}`, {
        headers,
      }),
      fetch(`${root}/api/v1/admin/notifications/ops/records?${query}`, { headers }),
      fetch(`${root}/api/v1/admin/notifications/ops/dead-letters?limit=25`, { headers }),
      fetch(
        `${root}/api/v1/admin/notifications/otp-challenges?country_code=${encodeURIComponent(country || '')}&limit=20`,
        { headers },
      ),
    ]);
    setLoading(false);
    if (!inboxRes.ok || !prefRes.ok) {
      setError(true);
      return;
    }
    const inboxBody = (await inboxRes.json()) as { data?: InboxItem[] };
    setInbox(inboxBody.data ?? []);
    setPrefs((await prefRes.json()) as Prefs);
    if (snapRes.ok) {
      setOps((await snapRes.json()) as OpsSnapshot);
    }
    if (recRes.ok) {
      const body = (await recRes.json()) as { data?: OpsRecord[] };
      setRecords(body.data ?? []);
    }
    if (dlqRes.ok) {
      const body = (await dlqRes.json()) as { data?: DeadLetter[] };
      setDeadLetters(body.data ?? []);
    } else {
      setDeadLetters([]);
    }
    if (otpRes.ok) {
      const body = (await otpRes.json()) as { data?: OtpChallengeRow[] };
      setOtpChallenges(body.data ?? []);
    } else {
      setOtpChallenges([]);
    }
    try {
      const crm = await listCrmCustomers(token, { country_code: workingCountry(session.countryCode) });
      const rows = crm.data ?? [];
      setCustomers(rows);
      setTargetPerson((current) => current || rows[0]?.person_id || '');
    } catch {
      setCustomers([]);
    }
  }, [filterChannel, filterEvent, filterRecipient, filterStatus, getAccessToken, session.countryCode]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [load, session.status]);

  async function patchPref(partial: Prefs) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const next = { ...prefs, ...partial };
    setPrefs(next);
    await fetch(`${adminApiRoot()}/api/v1/me/notifications/preferences`, {
      method: 'PATCH',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(next),
    });
  }

  async function markRead(id: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    await fetch(`${adminApiRoot()}/api/v1/me/notifications/inbox/${encodeURIComponent(id)}/read`, {
      method: 'POST',
      headers: adminAuthHeaders(token),
    });
    await load();
  }

  async function sendToPerson() {
    const token = getAccessToken();
    if (!token || !targetPerson.trim() || !sendTitle.trim() || !sendBody.trim()) {
      return;
    }
    const res = await fetch(`${adminApiRoot()}/api/v1/admin/notifications/send`, {
      method: 'POST',
      headers: adminAuthHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        person_id: targetPerson.trim(),
        title: sendTitle.trim(),
        body: sendBody.trim(),
      }),
    });
    const body = res.ok ? ((await res.json()) as { live_delivery?: boolean; delivery_status?: string }) : null;
    setSendMessage(
      res.ok
        ? `Sandbox notice queued (${body?.delivery_status ?? 'SANDBOX_DELIVERED'}). Live delivery: ${String(body?.live_delivery ?? false)}.`
        : 'Send failed (need campaign:read).',
    );
    await load();
  }

  return (
    <section className="wp-stack">
      <header className="wp-page-header">
        <Heading level={1}>Notifications</Heading>
        <p className="wp-page-intro">
          Communication operations console. In-app sandbox delivery is truthful; SMS / email / push / WhatsApp remain
          EXTERNAL_GATED. Message bodies are not listed in ops tables.
        </p>
      </header>
      <div className="wp-toolbar">
        <Link href="/marketing">
          <Button size="sm" variant="secondary">
            Marketing campaigns
          </Button>
        </Link>
        <Link href="/reliability">
          <Button size="sm" variant="secondary">
            Reliability / outbox
          </Button>
        </Link>
        <Button size="sm" variant="tertiary" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>
      {loading && inbox.length === 0 && !ops ? <LoadingState label="Loading notifications" /> : null}
      {error ? <AdminRequestError error={error} onRetry={() => void load()} /> : null}

      {ops ? (
        <Card>
          <Heading level={2}>Communication operations</Heading>
          <p className="wp-text-muted">
            Live delivery: {String(ops.live_delivery ?? false)}. Sandbox metrics only.
          </p>
          <div className="wp-stat-grid">
            <div>
              <Heading level={3}>{ops.volume ?? 0}</Heading>
              <p className="wp-text-muted">Volume</p>
            </div>
            <div>
              <Heading level={3}>{ops.sandbox_delivered ?? 0}</Heading>
              <p className="wp-text-muted">Sandbox delivered</p>
            </div>
            <div>
              <Heading level={3}>{ops.external_gated_count ?? 0}</Heading>
              <p className="wp-text-muted">External gated</p>
            </div>
            <div>
              <Heading level={3}>{ops.outbox?.pending ?? 0}</Heading>
              <p className="wp-text-muted">Outbox queued</p>
            </div>
            <div>
              <Heading level={3}>{ops.outbox?.failed ?? 0}</Heading>
              <p className="wp-text-muted">Outbox failed</p>
            </div>
            <div>
              <Heading level={3}>{ops.outbox?.dead_lettered ?? 0}</Heading>
              <p className="wp-text-muted">Dead letter</p>
            </div>
          </div>
          {ops.channels ? (
            <p className="wp-text-muted">
              Channels:{' '}
              {Object.entries(ops.channels)
                .map(
                  ([name, meta]) =>
                    `${name}=${meta.production ? 'prod-ready' : meta.external_gate ?? 'sandbox'}`,
                )
                .join(' · ')}
            </p>
          ) : null}
        </Card>
      ) : null}

      {ops?.production_gates ? (
        <Card>
          <Heading level={2}>Production OTP &amp; messaging rail</Heading>
          <p className="wp-text-muted">
            Fail-closed until OTP_PROVIDER / SMS_PROVIDER are VERIFIED with sender config refs. Production never falls
            back to mock/console.
          </p>
          <div className="wp-stat-grid">
            <div>
              <Heading level={3}>{ops.production_gates.otp?.available ? 'AVAILABLE' : 'BLOCKED'}</Heading>
              <p className="wp-text-muted">OTP gate</p>
            </div>
            <div>
              <Heading level={3}>{ops.production_gates.messaging?.available ? 'AVAILABLE' : 'BLOCKED'}</Heading>
              <p className="wp-text-muted">Messaging gate</p>
            </div>
          </div>
          {ops.production_gates.otp?.blockers?.length ? (
            <p className="wp-text-muted">OTP blockers: {ops.production_gates.otp.blockers.join(', ')}</p>
          ) : null}
          {ops.production_gates.messaging?.blockers?.length ? (
            <p className="wp-text-muted">
              Messaging blockers: {ops.production_gates.messaging.blockers.join(', ')}
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Heading level={2}>OTP challenges (masked)</Heading>
        <p className="wp-text-muted">Plaintext OTP codes are never shown.</p>
        {otpChallenges.length === 0 ? (
          <EmptyState title="No OTP challenges" description="Recent auth OTP challenges will appear here." />
        ) : (
          <ul className="wp-stack">
            {otpChallenges.map((row) => (
              <li key={row.id}>
                <strong>
                  {row.purpose} · {row.status}
                </strong>{' '}
                <span className="wp-text-muted">
                  {row.masked_recipient} · {row.channel} · attempts {row.attempt_count}/{row.max_attempts} ·{' '}
                  {row.provider_status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <Heading level={2}>Ops filters</Heading>
        <div className="wp-form-grid">
          <FormField label="Status">
            {({ id }) => (
              <Input
                id={id}
                value={filterStatus}
                onChange={(event) => setFilterStatus(event.target.value)}
                placeholder="SANDBOX_DELIVERED"
              />
            )}
          </FormField>
          <FormField label="Channel">
            {({ id }) => (
              <Input
                id={id}
                value={filterChannel}
                onChange={(event) => setFilterChannel(event.target.value)}
                placeholder="in_app"
              />
            )}
          </FormField>
          <FormField label="Event type">
            {({ id }) => (
              <Input
                id={id}
                value={filterEvent}
                onChange={(event) => setFilterEvent(event.target.value)}
                placeholder="ORDER_CREATED"
              />
            )}
          </FormField>
          <FormField label="Recipient">
            {({ id }) => (
              <Input
                id={id}
                value={filterRecipient}
                onChange={(event) => setFilterRecipient(event.target.value)}
                placeholder="customer"
              />
            )}
          </FormField>
          <div className="wp-form-actions">
            <Button size="sm" onClick={() => void load()}>
              Apply filters
            </Button>
          </div>
        </div>
      </Card>

      {records.length ? (
        <div className="wp-admin-table-wrap">
          <table className="wp-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Event</th>
                <th>Status</th>
                <th>Channel</th>
                <th>Recipient</th>
                <th>Country</th>
                <th>Correlation</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>{row.event_type ?? '—'}</td>
                  <td>{row.status}</td>
                  <td>{row.channel}</td>
                  <td>{row.recipient_category}</td>
                  <td>{row.country_code ?? '—'}</td>
                  <td>
                    <code>{row.correlation_id ?? row.id.slice(0, 8)}</code>
                  </td>
                  <td>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No ops records" description="Domain events will appear here after sandbox delivery." />
      )}

      {deadLetters.length ? (
        <Card>
          <Heading level={2}>Notification dead letters</Heading>
          <p className="wp-text-muted">Replay is not available from this console.</p>
          <div className="wp-admin-table-wrap">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Attempts</th>
                  <th>Reason</th>
                  <th>Country</th>
                  <th>Failed</th>
                </tr>
              </thead>
              <tbody>
                {deadLetters.map((row) => (
                  <tr key={row.id}>
                    <td>{row.event_type}</td>
                    <td>{row.attempts}</td>
                    <td>{row.failure_reason ?? '—'}</td>
                    <td>{row.country_code ?? '—'}</td>
                    <td>{row.failed_at ? new Date(row.failed_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card>
        <Heading level={2}>Send in-app notice</Heading>
        <div className="wp-form-grid">
          <FormField label="Recipient">
            {({ id }) =>
              customers.length ? (
                <Select
                  id={id}
                  aria-label="Recipient person id"
                  value={targetPerson}
                  onChange={(event) => setTargetPerson(event.target.value)}
                >
                  {customers.map((row) => (
                    <option key={row.person_id} value={row.person_id}>
                      {row.identifiers[0]?.masked_value ?? row.person_id.slice(0, 8)}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={id}
                  aria-label="Recipient person id"
                  value={targetPerson}
                  onChange={(event) => setTargetPerson(event.target.value)}
                />
              )
            }
          </FormField>
          <FormField label="Title">
            {({ id }) => (
              <Input
                id={id}
                aria-label="Notice title"
                value={sendTitle}
                onChange={(event) => setSendTitle(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Body">
            {({ id }) => (
              <TextArea
                id={id}
                aria-label="Notice body"
                value={sendBody}
                onChange={(event) => setSendBody(event.target.value)}
              />
            )}
          </FormField>
          <div className="wp-form-actions">
            <Button
              onClick={() => void sendToPerson()}
              disabled={!targetPerson.trim() || !sendTitle.trim() || !sendBody.trim()}
            >
              Send
            </Button>
          </div>
        </div>
        {sendMessage ? <p className="wp-text-muted">{sendMessage}</p> : null}
      </Card>
      <NotificationProviderMatrixPanel />
      <Card>
        <Heading level={2}>This operator’s channels</Heading>
        <Switch
          label="Email"
          checked={Boolean(prefs.email_enabled)}
          onCheckedChange={(checked) => void patchPref({ email_enabled: checked })}
        />
        <Switch
          label="Push"
          checked={Boolean(prefs.push_enabled)}
          onCheckedChange={(checked) => void patchPref({ push_enabled: checked })}
        />
        <Switch
          label="SMS"
          checked={Boolean(prefs.sms_enabled)}
          onCheckedChange={(checked) => void patchPref({ sms_enabled: checked })}
        />
        <Switch
          label="Marketing (optional)"
          checked={Boolean(prefs.marketing)}
          onCheckedChange={(checked) => void patchPref({ marketing: checked })}
        />
        <p className="wp-text-muted">Order / appointment / delivery operational prefs cannot be disabled.</p>
      </Card>
      {inbox.length ? (
        <div className="wp-admin-table-wrap">
          <table className="wp-table">
            <thead>
              <tr>
                <th>Notice</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {inbox.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.title ?? item.id}</strong>
                    {item.body ? <p className="wp-text-muted">{item.body}</p> : null}
                    {item.delivery_status ? (
                      <p className="wp-text-muted">Delivery: {item.delivery_status}</p>
                    ) : null}
                  </td>
                  <td>{item.read ? <span className="wp-status">Read</span> : 'Unread'}</td>
                  <td>
                    {!item.read ? (
                      <Button size="sm" variant="secondary" onClick={() => void markRead(item.id)}>
                        Mark read
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="Inbox empty"
          description="Transactional events appear here after orders, labs, or support fire."
        />
      )}
    </section>
  );
}

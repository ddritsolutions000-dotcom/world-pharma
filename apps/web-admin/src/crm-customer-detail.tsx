'use client';

import Link from 'next/link';
import { AdminViewLoadError } from './admin-request-error';
import { classifyAdminViewState } from './admin-http';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
  Text,
} from '@world-pharma/ui-kit/web';
import { CrmApiError, getCrmCustomer360, revealCrmIdentifiers, type CrmCustomer360 } from './crm-api';
import { workingCountry } from './working-country';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error' | 'not_found';

export function CrmCustomerDetail({ personId }: { personId: string }) {
  const searchParams = useSearchParams();
  const countryCode = workingCountry(searchParams.get('country'));
  const { getAccessToken, session } = useSession();
  const [data, setData] = useState<CrmCustomer360 | null>(null);
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [revealReason, setRevealReason] = useState('');
  const [revealed, setRevealed] = useState<Array<{ type: string; value: string; verified: boolean }> | null>(null);
  const [revealMessage, setRevealMessage] = useState('');
  const canReveal = session.permissions.includes('user:reveal_pii');

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await getCrmCustomer360(token, personId, countryCode);
      setData(body);
      setViewState('idle');
    } catch (err) {
      if (err instanceof CrmApiError && err.status === 403) {
        setViewState('forbidden');
        return;
      }
      if (err instanceof CrmApiError && err.status === 404) {
        setViewState('not_found');
        return;
      }
      setViewState(classifyAdminViewState(err));
    }
  }, [countryCode, getAccessToken, personId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (viewState === 'loading') {
    return <LoadingState label="Loading customer 360" />;
  }
  if (viewState === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (viewState === 'not_found') {
    return (
      <EmptyState
        title="Customer not found"
        description="No operational activity for this person in the selected country."
      />
    );
  }
  if (viewState === 'network' || viewState === 'error') {
    return <AdminViewLoadError viewState={viewState} onRetry={() => void load()} />;
  }
  if (!data) {
    return null;
  }

  return (
    <div className="wp-stack">
      <Heading level={1}>Customer 360</Heading>
      <Text tone="secondary">
        Person <code>{data.person_id}</code> · Country {data.country_code}. Identifiers are masked until an audited
        reveal.
      </Text>
      {canReveal ? (
        <Card>
          <Heading level={3}>Reveal identifiers</Heading>
          <Text tone="secondary">Requires a support reason (min 8 chars). Logged as CRM_PII_REVEAL.</Text>
          <FormField label="Reason">
            {({ id }) => (
              <Input id={id} value={revealReason} onChange={(event) => setRevealReason(event.target.value)} />
            )}
          </FormField>
          <Button
            disabled={revealReason.trim().length < 8}
            onClick={() => {
              const token = getAccessToken();
              if (!token) {
                return;
              }
              setRevealMessage('');
              void revealCrmIdentifiers(token, personId, countryCode, revealReason.trim())
                .then((body) => {
                  setRevealed(body.identifiers);
                  setRevealMessage(`Revealed at ${body.revealed_at}`);
                })
                .catch((err) => {
                  setRevealMessage(err instanceof CrmApiError ? err.message : 'Reveal failed');
                });
            }}
          >
            Reveal email / phone
          </Button>
          {revealMessage ? <Text tone="secondary">{revealMessage}</Text> : null}
          {revealed ? (
            <ul>
              {revealed.map((row) => (
                <li key={`${row.type}-${row.value}`}>
                  {row.type}: {row.value} {row.verified ? '(verified)' : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
      <div className="wp-toolbar">
        <Link href="/crm">
          <Button variant="secondary">Back to lookup</Button>
        </Link>
        <Link href="/notifications">
          <Button variant="secondary">Notification inbox</Button>
        </Link>
        <Link href="/support">
          <Button variant="secondary">Support</Button>
        </Link>
      </div>

      <Card>
        <Heading level={2}>Profile</Heading>
        <Text>Status: {data.profile.status}</Text>
        <ul>
          {data.profile.identifiers.map((id) => (
            <li key={`${id.type}-${id.masked_value}`}>
              {id.type}: {id.masked_value} {id.verified ? '(verified)' : ''}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <Heading level={2}>Orders ({data.orders.length})</Heading>
        {data.orders.length === 0 ? (
          <Text tone="secondary">No orders</Text>
        ) : (
          <ul>
            {data.orders.map((order) => (
              <li key={order.id}>
                <Link href={`/orders?orderId=${order.id}`}>{order.order_number}</Link> — {order.status} — {order.total_minor}{' '}
                {order.currency}
                {order.has_prescription_link ? ' (Rx link)' : ''}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <Heading level={2}>Appointments ({data.appointments.length})</Heading>
        {data.appointments.length === 0 ? (
          <Text tone="secondary">No appointments</Text>
        ) : (
          <ul>
            {data.appointments.map((appt) => (
              <li key={appt.id}>
                {appt.type} — {appt.status} — {appt.starts_at} · <Link href="/appointments">Appointments desk</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <Heading level={2}>Lab bookings ({data.lab_bookings.length})</Heading>
        {data.lab_bookings.map((row) => (
          <Text key={row.id}>
            {row.id.slice(0, 8)}… — {row.status} — report released: {String(row.report_released)} ·{' '}
            <Link href="/labs">Labs desk</Link>
          </Text>
        ))}
      </Card>

      <Card>
        <Heading level={2}>Support tickets ({data.support_tickets.length})</Heading>
        {data.support_tickets.map((ticket) => (
          <Text key={ticket.id}>
            <Link href={`/support/${ticket.id}`}>{ticket.subject}</Link> — {ticket.status}
          </Text>
        ))}
      </Card>

      <Card>
        <Heading level={2}>Imaging bookings ({data.imaging_bookings.length})</Heading>
        {data.imaging_bookings.length === 0 ? (
          <Text tone="secondary">No imaging bookings</Text>
        ) : (
          data.imaging_bookings.map((row) => (
            <Text key={row.id}>
              {row.id.slice(0, 8)}… — {row.status} — report released: {String(row.report_released)} ·{' '}
              <Link href="/imaging">Imaging desk</Link>
            </Text>
          ))
        )}
      </Card>

      <Card>
        <Heading level={2}>Refills ({data.refill_requests.length})</Heading>
        {data.refill_requests.length === 0 ? (
          <Text tone="secondary">No refill requests</Text>
        ) : (
          data.refill_requests.map((row) => (
            <Text key={row.id}>
              {row.status} — {row.created_at} · <Link href="/refills">Refill desk</Link>
            </Text>
          ))
        )}
      </Card>

      <Card>
        <Heading level={2}>Rx subscriptions ({(data.rx_subscriptions ?? []).length})</Heading>
        {(data.rx_subscriptions ?? []).map((row) => (
          <Text key={row.id}>
            {row.status} — auto-execute {String(row.auto_execute_enabled)} · <Link href="/prescriptions">Rx desk</Link>
          </Text>
        ))}
      </Card>

      <Card>
        <Heading level={2}>Loyalty</Heading>
        {(data.loyalty ?? []).length === 0 ? (
          <Text tone="secondary">No loyalty account in this country</Text>
        ) : (
          (data.loyalty ?? []).map((row) => (
            <Text key={row.program_code}>
              {row.program_name} ({row.program_code}): {row.points_balance} pts · {row.program_status} ·{' '}
              <Link href="/loyalty">Loyalty</Link>
            </Text>
          ))
        )}
      </Card>

      <Card>
        <Heading level={2}>Product reviews ({(data.product_reviews ?? []).length})</Heading>
        <Text tone="secondary">Rating and moderation status only — review body is on the Reviews desk.</Text>
        {(data.product_reviews ?? []).map((row) => (
          <Text key={row.id}>
            {row.rating}/5 · {row.status} · /{row.catalog_slug} · <Link href="/reviews">Moderate</Link>
          </Text>
        ))}
      </Card>

      <Card>
        <Heading level={2}>Marketing preferences</Heading>
        <Text>
          Marketing allowed: {String(data.marketing_preferences.marketing_allowed)} · Email allowed:{' '}
          {String(data.marketing_preferences.email_allowed)}
        </Text>
      </Card>
    </div>
  );
}

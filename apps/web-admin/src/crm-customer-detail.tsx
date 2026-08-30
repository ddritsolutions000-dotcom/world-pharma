'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  Heading,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  Text,
} from '@world-pharma/ui-kit/web';
import { CrmApiError, getCrmCustomer360, type CrmCustomer360 } from './crm-api';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'not_found';

export function CrmCustomerDetail({ personId }: { personId: string }) {
  const searchParams = useSearchParams();
  const countryCode = searchParams.get('country') ?? 'XX';
  const { getAccessToken } = useSession();
  const [data, setData] = useState<CrmCustomer360 | null>(null);
  const [viewState, setViewState] = useState<ViewState>('loading');

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
      setViewState('network');
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
  if (viewState === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: () => void load() }} />;
  }
  if (!data) {
    return null;
  }

  return (
    <div className="wp-stack">
      <Heading level={1}>Customer 360</Heading>
      <Text tone="secondary">
        Person <code>{data.person_id}</code> · Country {data.country_code}. Masked identifiers only —{' '}
        <code>reveal-pii</code> not implemented (TD-R11A-04).
      </Text>
      <Link href="/crm">
        <Button variant="secondary">Back to lookup</Button>
      </Link>

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
                {order.order_number} — {order.status} — {order.total_minor} {order.currency}
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
                {appt.type} — {appt.status} — {appt.starts_at}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <Heading level={2}>Lab bookings ({data.lab_bookings.length})</Heading>
        {data.lab_bookings.map((row) => (
          <Text key={row.id}>
            {row.id.slice(0, 8)}… — {row.status} — report released: {String(row.report_released)}
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
        <Heading level={2}>Marketing preferences</Heading>
        <Text>
          Marketing allowed: {String(data.marketing_preferences.marketing_allowed)} · Email allowed:{' '}
          {String(data.marketing_preferences.email_allowed)}
        </Text>
      </Card>
    </div>
  );
}

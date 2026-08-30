'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import { Button, Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';
import { fetchOrder, requestOrderCancel, type CustomerOrder } from './commerce-api';

export function OrderDetailScreen({ orderNumber }: { orderNumber: string }) {
  const { session, getAccessToken } = useSession();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    void fetchOrder(token, orderNumber)
      .then((body) => setOrder(body as CustomerOrder))
      .catch((err: { message?: string }) => setError(err.message ?? 'Order could not be loaded.'));
  }, [getAccessToken, orderNumber, session.status]);

  if (session.status !== 'authenticated') {
    return <EmptyState title="Sign in required" description="Sign in to view this order." />;
  }
  if (error) {
    return <EmptyState title="Order unavailable" description={error} />;
  }
  if (!order) {
    return <Text>Loading order…</Text>;
  }

  async function cancel() {
    const token = getAccessToken();
    if (!token || !order) {
      return;
    }
    try {
      await requestOrderCancel(token, order.id, `cancel-${Date.now()}`);
      setMessage('Cancel requested.');
    } catch (err) {
      setMessage((err as { message?: string }).message ?? 'Cancel was not allowed.');
    }
  }

  return (
    <section>
      <Heading level={1}>Order {order.order_number}</Heading>
      <Text tone="secondary">Sandbox order. Tracking placeholder — no DHL.</Text>
      <Card>
        <Text>Status {order.status}</Text>
        <Text>
          Total {order.currency} {order.total_minor}
        </Text>
        <Text>Payment {order.payment?.payment_intent_id ?? '—'}</Text>
        {order.prescription_id ? (
          <Text size="caption">{`Prescription: ${order.prescription_id}`}</Text>
        ) : null}
        {order.dispensing_case_id ? (
          <Text size="caption">{`Dispensing case: ${order.dispensing_case_id}`}</Text>
        ) : null}
        {order.rx_inventory_consumed_at_dispense ? (
          <Text size="caption">Rx inventory consumed at dispense</Text>
        ) : null}
        <Text>Tracking: sandbox mock carrier only (no live DHL)</Text>
      </Card>
      <Button onClick={() => void cancel()}>Request cancel</Button>
      {message ? <Text>{message}</Text> : null}
    </section>
  );
}

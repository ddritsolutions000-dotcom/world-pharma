'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  EmptyState,
  FormField,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import { createAddress, deleteAddress, fetchAddresses, type CustomerAddress } from './account-api';
import { useSelectedCountry } from './use-selected-country';
import { AccountPage } from './ui/account-hub-nav';
import { MgBtn, MgCard } from './ui/mg-ui';

function addressLabel(row: CustomerAddress): string {
  const name = row.recipient_name ?? row.recipientName ?? 'Recipient';
  return `${name} — ${row.line1}, ${row.city}`;
}

export function AddressesScreen() {
  const { session, getAccessToken, signOut, expire } = useSession();
  const { country } = useSelectedCountry();
  const [rows, setRows] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'network' | 'forbidden' | null>(null);
  const [recipientName, setRecipientName] = useState('');
  const [city, setCity] = useState('');
  const [line1, setLine1] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const load = useCallback(() => {
    const token = getAccessToken();
    if (!token || session.status !== 'authenticated') {
      return;
    }
    setLoading(true);
    void fetchAddresses({ token, onUnauthorized })
      .then((result) => {
        if (result.ok) {
          setRows(Array.isArray(result.data) ? result.data : []);
          setError(null);
        } else if (result.kind === 'forbidden') {
          setError('forbidden');
        } else if (result.kind !== 'unauthorized') {
          setError('network');
        }
      })
      .finally(() => setLoading(false));
  }, [getAccessToken, onUnauthorized, session.status]);

  useEffect(() => {
    load();
  }, [load]);

  if (session.status === 'expired') {
    return <SessionExpiredState action={{ label: 'Sign in again', onClick: () => signOut() }} />;
  }

  if (session.status !== 'authenticated') {
    return <EmptyState title="Sign in required" description="Sign in to manage delivery addresses." />;
  }

  if (session.audience !== 'customer') {
    return <PermissionDeniedState />;
  }

  if (loading) {
    return <LoadingState label="Loading addresses" />;
  }

  if (error === 'forbidden') {
    return <PermissionDeniedState />;
  }

  if (error === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: load }} />;
  }

  async function addAddress() {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const result = await createAddress({
      token,
      onUnauthorized,
      country_code: country,
      recipient_name: recipientName,
      city,
      line1,
    });
    if (result.ok) {
      setRecipientName('');
      setCity('');
      setLine1('');
      setMessage('Address saved.');
      load();
    } else {
      setMessage(result.error);
    }
  }

  async function removeAddress(id: string) {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const result = await deleteAddress({ token, onUnauthorized, id });
    if (result.ok) {
      load();
    } else {
      setMessage(result.error);
    }
  }

  return (
    <AccountPage title="Saved Addresses" subtitle="Delivery addresses for medicine orders and lab collection.">
      {!rows.length ? (
        <EmptyState title="No addresses" description="Add a delivery address for checkout." />
      ) : (
        <ul className="mg-order-list">
          {rows.map((row) => (
            <li key={row.id}>
              <MgCard className="mg-order-card">
                <div className="mg-order-card-top">
                  <p className="mg-list-title">{addressLabel(row)}</p>
                </div>
                <div className="mg-list-actions">
                  <MgBtn size="sm" variant="ghost" onClick={() => void removeAddress(row.id)}>
                    Remove
                  </MgBtn>
                </div>
              </MgCard>
            </li>
          ))}
        </ul>
      )}
      <MgCard>
        <h2 className="mg-section-title">Add new address</h2>
        <FormField label="Recipient name">
          {({ id }) => <Input id={id} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />}
        </FormField>
        <FormField label="City">
          {({ id }) => <Input id={id} value={city} onChange={(e) => setCity(e.target.value)} />}
        </FormField>
        <FormField label="Address line">
          {({ id }) => <Input id={id} value={line1} onChange={(e) => setLine1(e.target.value)} />}
        </FormField>
        <MgBtn onClick={() => void addAddress()}>Save address</MgBtn>
      </MgCard>
      {message ? <Text>{message}</Text> : null}
    </AccountPage>
  );
}

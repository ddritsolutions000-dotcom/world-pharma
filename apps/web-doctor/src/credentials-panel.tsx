'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Heading,
  Input,
  LoadingState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  fetchDoctorCredentials,
  submitDoctorCredential,
  type DoctorCredential,
} from './doctor-api';
import { DoctorLoadFailure, mapDoctorApiFailure, type DoctorLoadError } from './doctor-load-state';

export function DoctorCredentialsPanel() {
  const { getAccessToken, session, expire } = useSession();
  const [rows, setRows] = useState<DoctorCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DoctorLoadError | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [credentialType, setCredentialType] = useState('');
  const [issuer, setIssuer] = useState('');
  const [number, setNumber] = useState('');
  const [showForm, setShowForm] = useState(false);

  const onUnauthorized = useCallback(() => expire(), [expire]);

  const load = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchDoctorCredentials({ token, onUnauthorized });
    if (!result.ok) {
      setError(mapDoctorApiFailure(result.kind));
      setRows([]);
    } else {
      setRows(result.data.credentials ?? []);
    }
    setLoading(false);
  }, [getAccessToken, onUnauthorized]);

  useEffect(() => {
    if (session.status === 'authenticated') {
      void load();
    }
  }, [session.status, load]);

  async function handleSubmit() {
    const token = getAccessToken();
    if (!token || !credentialType.trim() || !issuer.trim() || !number.trim()) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await submitDoctorCredential({
      token,
      onUnauthorized,
      credential_type: credentialType.trim(),
      issuer: issuer.trim(),
      number: number.trim(),
    });
    setBusy(false);
    if (result.ok) {
      setMessage('Credential submitted for review.');
      setCredentialType('');
      setIssuer('');
      setNumber('');
      setShowForm(false);
      void load();
    } else {
      setMessage(result.error);
    }
  }

  if (loading) {
    return <LoadingState label="Loading credentials" />;
  }
  if (error) {
    return <DoctorLoadFailure error={error} onRetry={() => void load()} />;
  }

  return (
    <>
      <Text tone="secondary">
        Credential numbers are masked after submission. Full values are never shown in this workspace.
      </Text>
      {rows.length === 0 ? (
        <EmptyState
          title="No credentials on file"
          description="Submit license or registration metadata for verification. Document upload uses private storage when enabled."
        />
      ) : (
        rows.map((row) => (
          <Card key={row.id}>
            <Text>{row.credential_type}</Text>
            <Text size="caption">Issuer: {row.issuer}</Text>
            <Text size="caption">Number: {row.number_masked}</Text>
            <Text size="caption">Status: {row.status}</Text>
            {row.expires_on ? <Text size="caption">Expires: {row.expires_on}</Text> : null}
            {row.has_document ? <Text size="caption">Document on file</Text> : null}
          </Card>
        ))
      )}

      {showForm ? (
        <Card>
          <Heading level={2}>Submit credential</Heading>
          <FormField label="Credential type">
            {({ id }) => (
              <Input id={id} value={credentialType} onChange={(e) => setCredentialType(e.target.value)} />
            )}
          </FormField>
          <FormField label="Issuer">
            {({ id }) => <Input id={id} value={issuer} onChange={(e) => setIssuer(e.target.value)} />}
          </FormField>
          <FormField label="Credential number">
            {({ id }) => (
              <Input
                id={id}
                type="password"
                autoComplete="off"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            )}
          </FormField>
          <Button disabled={busy} onClick={() => void handleSubmit()}>
            {busy ? 'Submitting…' : 'Submit'}
          </Button>
          <Button variant="tertiary" size="sm" onClick={() => setShowForm(false)}>
            Cancel
          </Button>
        </Card>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
          Add credential
        </Button>
      )}

      {message ? <Text>{message}</Text> : null}
    </>
  );
}

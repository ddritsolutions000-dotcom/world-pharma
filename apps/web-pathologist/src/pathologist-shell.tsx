'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
  HeaderBar,
  Heading,
  Input,
  LoadingState,
  NetworkErrorState,
  PermissionDeniedState,
  SessionExpiredState,
  Text,
} from '@world-pharma/ui-kit/web';
import {
  PathologistApiError,
  amendPathologistReport,
  assignPathologistCase,
  fetchPathologistOrganizations,
  fetchPathologistWork,
  publishPathologistReport,
  verifyPathologistReport,
  type PathologistCase,
  type PathologistOrg,
} from './pathologist-api';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';

export function PathologistShell() {
  const { session, signInWithOtp, signOut, expire, getAccessToken } = useSession();
  const [email, setEmail] = useState('');
  const [organizations, setOrganizations] = useState<PathologistOrg[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [cases, setCases] = useState<PathologistCase[]>([]);
  const [selected, setSelected] = useState<PathologistCase | null>(null);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [amendReason, setAmendReason] = useState('');

  const handleApiError = useCallback((err: unknown) => {
    if (err instanceof PathologistApiError) {
      if (err.status === 401) {
        expire();
        return;
      }
      if (err.status === 403) {
        setViewState('forbidden');
        return;
      }
      setErrorMessage(err.message);
      setViewState('error');
      return;
    }
    setViewState('network');
  }, [expire]);

  const loadScope = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await fetchPathologistOrganizations(token);
      setOrganizations(body.data);
      if (!organizationId && body.data[0]) {
        setOrganizationId(body.data[0].id);
      }
      setViewState('idle');
    } catch (err) {
      handleApiError(err);
    }
  }, [getAccessToken, handleApiError, organizationId]);

  const loadWork = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !organizationId) {
      return;
    }
    setViewState('loading');
    try {
      const body = await fetchPathologistWork(token, organizationId);
      setCases(body.data);
      setViewState('idle');
    } catch (err) {
      handleApiError(err);
    }
  }, [getAccessToken, handleApiError, organizationId]);

  useEffect(() => {
    if (session?.status === 'authenticated') {
      void loadScope();
    }
  }, [session?.status, loadScope]);

  useEffect(() => {
    if (session?.status === 'authenticated' && organizationId) {
      void loadWork();
    }
  }, [session?.status, organizationId, loadWork]);

  const run = (fn: () => Promise<unknown>) => {
    void fn()
      .then(() => loadWork())
      .catch(handleApiError);
  };

  if (session?.status === 'expired') {
    return (
      <div className="path-body shell-main">
        <SessionExpiredState action={{ label: 'Sign in again', onClick: () => void signOut() }} />
      </div>
    );
  }

  if (!session || session.status !== 'authenticated') {
    return (
      <div className="path-body shell-main wp-stack">
        <Heading level={1}>Pathologist</Heading>
        <Card>
          <FormField label="Email">
            {({ id }) => <Input id={id} value={email} onChange={(e) => setEmail(e.target.value)} />}
          </FormField>
          <Button onClick={() => void signInWithOtp(email, 'partner_applicant')}>Sign in with OTP</Button>
        </Card>
      </div>
    );
  }

  const token = getAccessToken() ?? '';

  return (
    <div className="path-body shell-main wp-stack">
      <HeaderBar title="Pathologist worklist">
        <Button size="sm" variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </HeaderBar>
      <Card>
        <FormField label="Laboratory">
          {({ id }) => (
            <select id={id} className="wp-input" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
              <option value="">Select laboratory</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.display_name}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </Card>
      {viewState === 'loading' ? <LoadingState label="Loading pathology work…" /> : null}
      {viewState === 'forbidden' ? <PermissionDeniedState /> : null}
      {viewState === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadWork() }} />
      ) : null}
      {viewState === 'error' ? (
        <Card>
          <Text tone="secondary">{errorMessage}</Text>
        </Card>
      ) : null}
      {viewState === 'idle' && !cases.length ? (
        <EmptyState title="No assigned cases" description="Cases appear after lab staff submits results for verification." />
      ) : null}
      {cases.map((row) => (
        <Card key={row.id}>
          <Text>
            {row.accession_number} · {row.test_title} · {row.status}
          </Text>
          <Button size="sm" variant="secondary" onClick={() => setSelected(row)}>
            Review
          </Button>
        </Card>
      ))}
      {selected ? (
        <Card>
          <Heading level={2}>Case review</Heading>
          <Button size="sm" variant="tertiary" onClick={() => setSelected(null)}>
            Close
          </Button>
          <Text>{selected.summary ?? 'No summary'}</Text>
          {selected.results.map((line) => (
            <Text key={`${line.analyte_name}-${line.value}`} size="caption">
              {line.analyte_name}: {line.value} {line.unit ?? ''}
            </Text>
          ))}
          <Button size="sm" onClick={() => run(() => assignPathologistCase(token, organizationId, selected.id))}>
            Accept assignment
          </Button>
          {selected.status === 'PENDING_VERIFY' ? (
            <Button size="sm" onClick={() => run(() => verifyPathologistReport(token, organizationId, selected.id))}>
              Verify
            </Button>
          ) : null}
          {selected.status === 'VERIFIED' ? (
            <Button size="sm" onClick={() => run(() => publishPathologistReport(token, organizationId, selected.id))}>
              Publish report
            </Button>
          ) : null}
          {selected.status === 'PUBLISHED' ? (
            <>
              <FormField label="Amendment reason">
                {({ id }) => (
                  <Input id={id} value={amendReason} onChange={(e) => setAmendReason(e.target.value)} />
                )}
              </FormField>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => run(() => amendPathologistReport(token, organizationId, selected.id, amendReason))}
              >
                Amend (new version)
              </Button>
            </>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

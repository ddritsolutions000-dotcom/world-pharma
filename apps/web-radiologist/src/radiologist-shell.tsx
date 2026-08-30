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
  RadiologistApiError,
  assignRadiologistCase,
  amendRadiologistReport,
  fetchRadiologistCase,
  fetchRadiologistOrganizations,
  fetchRadiologistVerifyQueue,
  fetchRadiologistWorklist,
  publishRadiologistReport,
  saveRadiologistFindings,
  submitRadiologistReport,
  verifyRadiologistReport,
  type RadiologistCase,
  type RadiologistCaseDetail,
  type RadiologistOrg,
} from './radiologist-api';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'network' | 'error';
type Tab = 'worklist' | 'verify';

export function RadiologistShell() {
  const { session, signInWithOtp, signOut, expire, getAccessToken } = useSession();
  const [email, setEmail] = useState('');
  const [organizations, setOrganizations] = useState<RadiologistOrg[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [tab, setTab] = useState<Tab>('worklist');
  const [cases, setCases] = useState<RadiologistCase[]>([]);
  const [selected, setSelected] = useState<RadiologistCaseDetail | null>(null);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [findingText, setFindingText] = useState('');
  const [amendReason, setAmendReason] = useState('');

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof RadiologistApiError) {
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
    },
    [expire],
  );

  const loadScope = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setViewState('loading');
    try {
      const body = await fetchRadiologistOrganizations(token);
      setOrganizations(body.data);
      if (!organizationId && body.data[0]) {
        setOrganizationId(body.data[0].id);
      }
      setViewState('idle');
    } catch (err) {
      handleApiError(err);
    }
  }, [getAccessToken, handleApiError, organizationId]);

  const loadCases = useCallback(async () => {
    const token = getAccessToken();
    if (!token || !organizationId) {
      return;
    }
    setViewState('loading');
    try {
      const body =
        tab === 'verify'
          ? await fetchRadiologistVerifyQueue(token, organizationId)
          : await fetchRadiologistWorklist(token, organizationId);
      setCases(body.data);
      setViewState('idle');
    } catch (err) {
      handleApiError(err);
    }
  }, [getAccessToken, handleApiError, organizationId, tab]);

  const openCase = useCallback(
    async (row: RadiologistCase) => {
      const token = getAccessToken();
      if (!token || !organizationId) {
        return;
      }
      setViewState('loading');
      try {
        const detail = await fetchRadiologistCase(token, organizationId, row.imaging_study_id);
        setSelected(detail);
        setSummary(detail.version?.summary ?? '');
        setFindingText(detail.version?.findings[0]?.finding_text ?? '');
        setViewState('idle');
      } catch (err) {
        handleApiError(err);
      }
    },
    [getAccessToken, handleApiError, organizationId],
  );

  useEffect(() => {
    if (session?.status === 'authenticated') {
      void loadScope();
    }
  }, [session?.status, loadScope]);

  useEffect(() => {
    if (session?.status === 'authenticated' && organizationId) {
      void loadCases();
    }
  }, [session?.status, organizationId, tab, loadCases]);

  const run = (fn: () => Promise<unknown>) => {
    void fn()
      .then(async () => {
        await loadCases();
        if (selected) {
          const token = getAccessToken();
          if (token && organizationId) {
            const detail = await fetchRadiologistCase(token, organizationId, selected.imaging_study_id);
            setSelected(detail);
            setSummary(detail.version?.summary ?? '');
          }
        }
      })
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
        <Heading level={1}>Radiologist</Heading>
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
      <HeaderBar title="Radiologist worklist">
        <Button size="sm" variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </HeaderBar>
      <Card>
        <Text tone="secondary">
          Sandbox interpretation and digital report publication (R8-D/E). No image viewer, no DICOM download.
        </Text>
        <FormField label="Imaging center">
          {({ id }) => (
            <select id={id} className="wp-input" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
              <option value="">Select imaging center</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.display_name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <div className="wp-stack" style={{ flexDirection: 'row', gap: '0.5rem' }}>
          <Button size="sm" variant={tab === 'worklist' ? 'primary' : 'secondary'} onClick={() => setTab('worklist')}>
            Worklist
          </Button>
          <Button size="sm" variant={tab === 'verify' ? 'primary' : 'secondary'} onClick={() => setTab('verify')}>
            Verify queue
          </Button>
        </div>
      </Card>
      {viewState === 'loading' ? <LoadingState label="Loading radiology work…" /> : null}
      {viewState === 'forbidden' ? <PermissionDeniedState /> : null}
      {viewState === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadCases() }} />
      ) : null}
      {viewState === 'error' ? (
        <Card>
          <Text tone="secondary">{errorMessage}</Text>
        </Card>
      ) : null}
      {viewState === 'idle' && !cases.length ? (
        <EmptyState
          title={tab === 'verify' ? 'No cases pending verification' : 'No assigned cases'}
          description="Cases appear after acquisition is complete."
        />
      ) : null}
      {cases.map((row) => (
        <Card key={row.id}>
          <Text>
            {row.accession_number} · {row.study_title} · {row.status}
          </Text>
          <Button size="sm" variant="secondary" onClick={() => void openCase(row)}>
            Review
          </Button>
        </Card>
      ))}
      {selected ? (
        <Card>
          <Heading level={2}>Study review</Heading>
          <Button size="sm" variant="tertiary" onClick={() => setSelected(null)}>
            Close
          </Button>
          <Text>
            {selected.study_title} · {selected.modality_code ?? 'modality n/a'} · {selected.body_region_code ?? 'region n/a'}
          </Text>
          {selected.acquisition ? (
            <Card>
              <Text size="caption">Sandbox acquisition metadata (not a medical image)</Text>
              <Text size="caption">Ref: {selected.acquisition.sandbox_object_ref ?? 'pending'}</Text>
              <Text size="caption">{selected.acquisition.note}</Text>
            </Card>
          ) : null}
          <Text>Status: {selected.version?.status ?? 'n/a'}</Text>
          {selected.version?.findings.map((line) => (
            <Text key={`${line.finding_code}-${line.finding_text}`} size="caption">
              {line.finding_code}: {line.finding_text}
            </Text>
          ))}
          <Button size="sm" onClick={() => run(() => assignRadiologistCase(token, organizationId, selected.id))}>
            Accept assignment
          </Button>
          {selected.version?.status === 'DRAFT' ? (
            <>
              <FormField label="Summary">
                {({ id }) => <Input id={id} value={summary} onChange={(e) => setSummary(e.target.value)} />}
              </FormField>
              <FormField label="Primary finding (sandbox)">
                {({ id }) => <Input id={id} value={findingText} onChange={(e) => setFindingText(e.target.value)} />}
              </FormField>
              <Button
                size="sm"
                onClick={() =>
                  run(() =>
                    saveRadiologistFindings(token, organizationId, selected.id, {
                      summary,
                      findings: [{ finding_code: 'IMPRESSION', finding_text: findingText || 'Pending review' }],
                    }),
                  )
                }
              >
                Save draft
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => run(() => submitRadiologistReport(token, organizationId, selected.id))}
              >
                Submit for verify
              </Button>
            </>
          ) : null}
          {selected.version?.status === 'PENDING_VERIFY' ? (
            <Button size="sm" onClick={() => run(() => verifyRadiologistReport(token, organizationId, selected.id))}>
              Verify / sign-off
            </Button>
          ) : null}
          {selected.version?.status === 'VERIFIED' ? (
            <Button
              size="sm"
              onClick={() =>
                run(() =>
                  publishRadiologistReport(token, organizationId, selected.id, `pub-${selected.id}-${Date.now()}`),
                )
              }
            >
              Publish report to customer
            </Button>
          ) : null}
          {selected.version?.status === 'PUBLISHED' ? (
            <>
              <Text tone="secondary">Published to customer. Amendments create a new draft version requiring re-verification.</Text>
              <FormField label="Amendment reason">
                {({ id }) => <Input id={id} value={amendReason} onChange={(e) => setAmendReason(e.target.value)} />}
              </FormField>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  run(() => amendRadiologistReport(token, organizationId, selected.id, amendReason.trim()))
                }
              >
                Start amendment
              </Button>
            </>
          ) : null}
          {selected.boundary?.publication ? (
            <Text size="caption">Customer report access enabled.</Text>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

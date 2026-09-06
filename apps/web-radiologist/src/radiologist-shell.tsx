'use client';

import { useCallback, useEffect, useState } from 'react';
import { clinicalReportStatusLabel } from '@world-pharma/shell-core';
import { useSession, PortalWorkspaceShell, PartnerInboxPanel, PartnerSupportPanel, PortalKpiCards } from '@world-pharma/shell-web';
import {
  Button,
  Card,
  EmptyState,
  FormField,
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
  fetchRadiologistMe,
  fetchRadiologistOrganizations,
  fetchRadiologistVerifyQueue,
  fetchRadiologistViewerFrameBlob,
  fetchRadiologistViewerSession,
  fetchRadiologistWorklist,
  publishRadiologistReport,
  saveRadiologistFindings,
  submitRadiologistReport,
  verifyRadiologistReport,
  type RadiologistCase,
  type RadiologistCaseDetail,
  type RadiologistOrg,
} from './radiologist-api';
import {
  ImagingDiagnosticViewerPanel,
  type DiagnosticViewerSession,
} from './imaging-diagnostic-viewer';
import { canRadiologistVerify } from './radiologist-sod';

type ViewState = 'idle' | 'loading' | 'forbidden' | 'membership' | 'network' | 'error';
type Tab = 'worklist' | 'verify' | 'inbox' | 'support';

const RADIOLOGIST_TAB_LABELS: Record<Tab, string> = {
  worklist: 'Worklist',
  verify: 'Verify queue',
  inbox: 'Inbox',
  support: 'Support',
};

export function RadiologistShell() {
  const { session, signOut, expire, getAccessToken } = useSession();
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
  const [personId, setPersonId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerSession, setViewerSession] = useState<DiagnosticViewerSession | null>(null);
  const [viewerLoadState, setViewerLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'forbidden'
  >('idle');

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof RadiologistApiError) {
        if (err.status === 401) {
          expire();
          return;
        }
        if (err.status === 403 && err.code === 'MEMBERSHIP_REQUIRED') {
          setErrorMessage(err.message);
          setViewState('membership');
          return;
        }
        if (err.status === 403) {
          setErrorMessage(err.message);
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
      if (!organizationId && body.data.length) {
        const preferred =
          body.data.find((o) => o.country_code === 'IN') ??
          body.data.find((o) => o.country_code === 'XX') ??
          body.data[0];
        setOrganizationId(preferred.id);
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
    if (tab === 'inbox' || tab === 'support') {
      setViewState('idle');
      setCases([]);
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
      const token = getAccessToken();
      if (token) {
        void fetchRadiologistMe(token)
          .then((body) => setPersonId(body.person_id))
          .catch(() => setPersonId(null));
      }
      void loadScope();
    }
  }, [session?.status, loadScope, getAccessToken]);

  useEffect(() => {
    if (session?.status === 'authenticated' && organizationId) {
      void loadCases();
    }
  }, [session?.status, organizationId, tab, loadCases]);

  const run = (actionKey: string, fn: () => Promise<unknown>) => {
    setBusy(actionKey);
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
      .catch(handleApiError)
      .finally(() => setBusy(null));
  };

  const canVerifySelected =
    selected?.version?.status === 'PENDING_VERIFY' &&
    canRadiologistVerify(selected.version.entered_by, personId);

  if (session?.status === 'expired') {
    return (
      <div className="path-body shell-main">
        <SessionExpiredState action={{ label: 'Sign in again', onClick: () => void signOut() }} />
      </div>
    );
  }

  if (!session || session.status !== 'authenticated') {
    return (
      <PortalWorkspaceShell
        portalId="radiologist"
        brandTitle="Radiologist workspace"
        portalLabel="Radiologist"
        nav={[
          { id: 'worklist', label: 'Worklist' },
          { id: 'verify', label: 'Verify queue' },
          { id: 'inbox', label: 'Inbox' },
          { id: 'support', label: 'Support' },
        ]}
        currentNav="worklist"
        audience="customer"
      >
        {null}
      </PortalWorkspaceShell>
    );
  }

  const token = getAccessToken() ?? '';
  const pendingCount = cases.filter((row) => row.status === 'PENDING_VERIFY' || row.status === 'DRAFT').length;

  return (
    <PortalWorkspaceShell
      portalId="radiologist"
      brandTitle="Radiologist workspace"
      portalLabel="Radiologist"
      nav={[
        { id: 'worklist', label: 'Worklist' },
        { id: 'verify', label: 'Verify queue' },
        { id: 'inbox', label: 'Inbox' },
        { id: 'support', label: 'Support' },
      ]}
      currentNav={tab}
      onNavSelect={(id) => setTab(id as Tab)}
      audience="customer"
      breadcrumbs={[
        { label: 'World Pharma' },
        { label: 'Radiologist' },
        { label: RADIOLOGIST_TAB_LABELS[tab] },
      ]}
    >
      <header className="wp-page-header">
        <Heading level={1}>{RADIOLOGIST_TAB_LABELS[tab]}</Heading>
        <p className="wp-page-intro">
          Interpret acquired studies, draft findings, and send reports for a second-reader verify before publication.
        </p>
      </header>
      <p className="wp-sandbox-banner" role="status">
        SANDBOX diagnostic viewer for sandbox studies. Production PACS remains EXTERNAL_GATED. Report text and images stay separate.
      </p>
      <PortalKpiCards
        items={[
          { label: 'Open cases', value: cases.length },
          { label: 'Needs action', value: pendingCount },
          { label: 'Imaging centers', value: organizations.length },
        ]}
      />
      <Card>
        <FormField label="Imaging center">
          {({ id }) => (
            <select id={id} className="wp-input" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
              <option value="">Select imaging center</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.display_name} ({org.country_code})
                </option>
              ))}
            </select>
          )}
        </FormField>
      </Card>
      {tab === 'inbox' ? <PartnerInboxPanel token={token} audienceLabel="radiologists" /> : null}
      {tab === 'support' ? <PartnerSupportPanel token={token} audienceLabel="radiologists" /> : null}
      {tab === 'worklist' || tab === 'verify' ? (
      <div className="wp-work-layout">
      <div className="wp-stack">
      {viewState === 'loading' ? <LoadingState label="Loading radiology work…" /> : null}
      {viewState === 'membership' ? (
        <PermissionDeniedState
          title="Imaging center membership required"
          description={
            errorMessage ??
            'You must be an active staff member of this imaging center before interpreting or publishing reports.'
          }
          action={{ label: 'Retry worklist', onClick: () => void loadCases() }}
        />
      ) : null}
      {viewState === 'forbidden' ? (
        <PermissionDeniedState title="Radiology action not allowed" description={errorMessage ?? undefined} />
      ) : null}
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
      {cases.length ? (
        <table className="wp-data-table">
          <thead>
            <tr>
              <th>Accession</th>
              <th>Study</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cases.map((row) => (
              <tr key={row.id} className={selected?.id === row.id ? 'is-selected' : undefined}>
                <td>{row.accession_number}</td>
                <td>{row.study_title}</td>
                <td>
                  <span className="wp-status">{clinicalReportStatusLabel(row.status)}</span>
                </td>
                <td>
                  <Button size="sm" variant="secondary" onClick={() => void openCase(row)}>
                    Open viewer
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      </div>
      {selected ? (
        <Card>
          <Heading level={2}>Study review</Heading>
          <Button size="sm" variant="tertiary" onClick={() => { setSelected(null); setViewerOpen(false); setViewerSession(null); }}>
            Close
          </Button>
          <Text>
            {selected.study_title} · {selected.modality_code ?? 'modality n/a'} · {selected.body_region_code ?? 'region n/a'}
          </Text>
          <div className="wp-toolbar">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() =>
                run(`viewer-${selected.imaging_study_id}`, async () => {
                  const t = getAccessToken();
                  if (!t) return;
                  setViewerLoadState('loading');
                  setViewerOpen(true);
                  try {
                    const body = await fetchRadiologistViewerSession(
                      t,
                      organizationId,
                      selected.imaging_study_id,
                    );
                    setViewerSession(body);
                    setViewerLoadState(body.series?.length ? 'ready' : 'empty');
                  } catch (err) {
                    if (err instanceof RadiologistApiError && err.status === 403) {
                      setViewerLoadState('forbidden');
                    } else {
                      setViewerLoadState('error');
                    }
                    throw err;
                  }
                })
              }
            >
              {busy === `viewer-${selected.imaging_study_id}` ? 'Opening…' : 'View study'}
            </Button>
          </div>
          {viewerOpen ? (
            <ImagingDiagnosticViewerPanel
              session={viewerSession}
              loadState={viewerLoadState}
              onRetry={() => setViewerOpen(false)}
              fetchFrameBlob={async (seriesId, frameIndex) => {
                const t = getAccessToken();
                if (!t) throw new RadiologistApiError('session_expired', 401);
                return fetchRadiologistViewerFrameBlob(
                  t,
                  organizationId,
                  selected.imaging_study_id,
                  seriesId,
                  frameIndex,
                );
              }}
            />
          ) : null}
          {selected.acquisition ? (
            <Card>
              <Text size="caption">Sandbox acquisition metadata</Text>
              <Text size="caption">Ref: {selected.acquisition.sandbox_object_ref ?? 'pending'}</Text>
              <Text size="caption">{selected.acquisition.note}</Text>
            </Card>
          ) : null}
          <Text>Status: {clinicalReportStatusLabel(selected.version?.status)}</Text>
          {selected.version?.findings.map((line) => (
            <Text key={`${line.finding_code}-${line.finding_text}`} size="caption">
              {line.finding_code}: {line.finding_text}
            </Text>
          ))}
          <Button
            size="sm"
            disabled={Boolean(selected.assigned_radiologist_id) || busy !== null}
            onClick={() => run(`assign-${selected.id}`, () => assignRadiologistCase(token, organizationId, selected.id))}
          >
            {busy === `assign-${selected.id}` ? 'Assigning…' : selected.assigned_radiologist_id ? 'Assigned' : 'Accept assignment'}
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
                disabled={busy !== null}
                onClick={() =>
                  run(`save-${selected.id}`, () =>
                    saveRadiologistFindings(token, organizationId, selected.id, {
                      summary,
                      findings: [{ finding_code: 'IMPRESSION', finding_text: findingText || 'Pending review' }],
                    }),
                  )
                }
              >
                {busy === `save-${selected.id}` ? 'Saving…' : 'Save draft'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => run(`submit-${selected.id}`, () => submitRadiologistReport(token, organizationId, selected.id))}
              >
                {busy === `submit-${selected.id}` ? 'Submitting…' : 'Submit for verify'}
              </Button>
            </>
          ) : null}
          {selected.version?.status === 'PENDING_VERIFY' ? (
            <>
              {canVerifySelected ? (
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => run(`verify-${selected.id}`, () => verifyRadiologistReport(token, organizationId, selected.id))}
                >
                  {busy === `verify-${selected.id}` ? 'Verifying…' : 'Verify / sign-off'}
                </Button>
              ) : (
                <Text size="caption">
                  Separation of duties: the author cannot verify this report. Sign in as a different radiologist
                  (e.g. sandbox-radiologist-reviewer@dev.local) and use the Verify queue tab.
                </Text>
              )}
            </>
          ) : null}
          {selected.version?.status === 'VERIFIED' ? (
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                run(`publish-${selected.id}`, () =>
                  publishRadiologistReport(token, organizationId, selected.id, `pub-${selected.id}-${Date.now()}`),
                )
              }
            >
              {busy === `publish-${selected.id}` ? 'Publishing…' : 'Publish report to customer'}
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
                disabled={busy !== null || !amendReason.trim()}
                onClick={() =>
                  run(`amend-${selected.id}`, () => amendRadiologistReport(token, organizationId, selected.id, amendReason.trim()))
                }
              >
                {busy === `amend-${selected.id}` ? 'Starting…' : 'Start amendment'}
              </Button>
            </>
          ) : null}
          {selected.boundary?.publication ? (
            <Text size="caption">Customer report access enabled.</Text>
          ) : null}
        </Card>
      ) : null}
      </div>
      ) : null}
    </PortalWorkspaceShell>
  );
}

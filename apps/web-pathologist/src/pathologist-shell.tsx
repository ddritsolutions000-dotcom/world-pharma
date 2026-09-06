'use client';

import { useCallback, useEffect, useState } from 'react';
import { clinicalReportStatusLabel } from '@world-pharma/shell-core';
import { PartnerInboxPanel, PartnerSupportPanel, PortalKpiCards, PortalWorkspaceShell, useSession } from '@world-pharma/shell-web';
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

type ViewState = 'idle' | 'loading' | 'forbidden' | 'membership' | 'network' | 'error';
type NavId = 'worklist' | 'inbox' | 'support';

const NAV: Array<{ id: NavId; label: string }> = [
  { id: 'worklist', label: 'Worklist' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'support', label: 'Support' },
];

export function PathologistShell() {
  const { session, expire, getAccessToken } = useSession();
  const [organizations, setOrganizations] = useState<PathologistOrg[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [cases, setCases] = useState<PathologistCase[]>([]);
  const [selected, setSelected] = useState<PathologistCase | null>(null);
  const [viewState, setViewState] = useState<ViewState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [amendReason, setAmendReason] = useState('');
  const [nav, setNav] = useState<NavId>('worklist');

  const handleApiError = useCallback((err: unknown) => {
    if (err instanceof PathologistApiError) {
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
    const selectedId = selected?.id;
    void fn()
      .then(async () => {
        const access = getAccessToken();
        if (!access || !organizationId) {
          return;
        }
        const body = await fetchPathologistWork(access, organizationId);
        setCases(body.data);
        if (selectedId) {
          const next = body.data.find((row) => row.id === selectedId);
          if (next) {
            setSelected(next);
          } else {
            // Published cases leave the active worklist — keep a local published marker for UI confirmation.
            setSelected((prev) =>
              prev && prev.id === selectedId ? { ...prev, status: 'PUBLISHED' } : prev,
            );
          }
        }
        setViewState('idle');
      })
      .catch(handleApiError);
  };

  const token = getAccessToken() ?? '';

  return (
    <PortalWorkspaceShell
      portalId="pathologist"
      brandTitle="Pathologist workspace"
      portalLabel="Pathologist"
      nav={NAV}
      currentNav={nav}
      onNavSelect={(id) => setNav(id as NavId)}
      audience="customer"
      breadcrumbs={[
        { label: 'World Pharma' },
        { label: 'Pathologist' },
        { label: NAV.find((item) => item.id === nav)?.label ?? 'Worklist' },
      ]}
    >
      {nav === 'inbox' ? <PartnerInboxPanel token={token} audienceLabel="pathologists" /> : null}
      {nav === 'support' ? <PartnerSupportPanel token={token} audienceLabel="pathologists" /> : null}
      {nav === 'worklist' ? (
      <>
      <header className="wp-page-header">
        <Heading level={1}>Pathology worklist</Heading>
        <p className="wp-page-intro">
          Review lab-entered results, verify as a second reader, and publish to the authorized patient record.
        </p>
      </header>
      <PortalKpiCards
        items={[
          { label: 'Open cases', value: cases.length },
          { label: 'Pending verify', value: cases.filter((row) => row.status === 'PENDING_VERIFY').length },
          { label: 'Laboratories', value: organizations.length },
        ]}
      />
      <Card>
        <FormField label="Laboratory">
          {({ id }) => (
            <select id={id} className="wp-input" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
              <option value="">Select laboratory</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.display_name} ({org.country_code})
                </option>
              ))}
            </select>
          )}
        </FormField>
      </Card>
      {viewState === 'loading' ? <LoadingState label="Loading pathology work…" /> : null}
      {viewState === 'membership' ? (
        <PermissionDeniedState
          title="Laboratory membership required"
          description={
            errorMessage ??
            'You must be an active staff member of this laboratory before reviewing or publishing reports. Ask an operator to grant org_staff membership for the selected lab.'
          }
          action={{ label: 'Retry worklist', onClick: () => void loadWork() }}
        />
      ) : null}
      {viewState === 'forbidden' ? (
        <PermissionDeniedState
          title="Pathology action not allowed"
          description={errorMessage ?? undefined}
        />
      ) : null}
      {viewState === 'network' ? (
        <NetworkErrorState action={{ label: 'Retry', onClick: () => void loadWork() }} />
      ) : null}
      {viewState === 'error' ? (
        <Card>
          <Text tone="secondary">{errorMessage}</Text>
        </Card>
      ) : null}
      {viewState === 'idle' && !cases.length ? (
        <EmptyState
          title="No cases in this laboratory"
          description="Cases appear after lab staff complete processing and submit results. Select another lab if your roster covers more than one site."
        />
      ) : null}
      <div className="wp-work-layout">
      {cases.length ? (
        <table className="wp-data-table">
          <thead>
            <tr>
              <th>Accession</th>
              <th>Test</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cases.map((row) => (
              <tr key={row.id} className={selected?.id === row.id ? 'is-selected' : undefined}>
                <td>{row.accession_number}</td>
                <td>{row.test_title}</td>
                <td>
                  <span className="wp-status">{clinicalReportStatusLabel(row.status)}</span>
                </td>
                <td>
                  <Button size="sm" variant={selected?.id === row.id ? 'primary' : 'secondary'} onClick={() => setSelected(row)}>
                    Review
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
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
          {!selected.status || selected.status === 'DRAFT' ? (
            <Button size="sm" onClick={() => run(() => assignPathologistCase(token, organizationId, selected.id))}>
              Accept assignment
            </Button>
          ) : null}
          {selected.status === 'PENDING_VERIFY' ? (
            <>
              <Text size="caption">Status: pending verification — confirm analyte values, then Verify.</Text>
              <Button size="sm" onClick={() => run(() => verifyPathologistReport(token, organizationId, selected.id))}>
                Verify
              </Button>
            </>
          ) : null}
          {selected.status === 'VERIFIED' ? (
            <>
              <Text size="caption">Status: verified — Publish to release the report to the customer.</Text>
              <Button size="sm" onClick={() => run(() => publishPathologistReport(token, organizationId, selected.id))}>
                Publish report
              </Button>
            </>
          ) : null}
          {selected.status === 'PUBLISHED' ? (
            <>
              <Text size="caption">Published — visible to the authorized customer. Amendments create a new version.</Text>
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
      </>
      ) : null}
    </PortalWorkspaceShell>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { PortalKpiCards } from '@world-pharma/shell-web';
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
  LabApiError,
  enterLabReportResults,
  fetchLabPathology,
  fetchLabReport,
  submitLabReportVerify,
  type LabPathologyRow,
  type LabReportDetail,
} from './lab-api';

type ResultLineForm = {
  analyte_code: string;
  analyte_name: string;
  value: string;
  unit: string;
};

type EntryViewState = 'idle' | 'submitting' | 'success' | 'forbidden' | 'network' | 'error';

const emptyLine = (): ResultLineForm => ({
  analyte_code: '',
  analyte_name: '',
  value: '',
  unit: '',
});

export function LabPathologyPanel({
  organizationId,
  token,
  onError,
}: {
  organizationId: string;
  token: string;
  onError: (err: unknown) => void;
}) {
  const [rows, setRows] = useState<LabPathologyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LabReportDetail | null>(null);
  const [entryReportId, setEntryReportId] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [line, setLine] = useState<ResultLineForm>(emptyLine);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [entryView, setEntryView] = useState<EntryViewState>('idle');
  const [entryMessage, setEntryMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchLabPathology(token, organizationId);
      setRows(body.data);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [onError, organizationId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (reportId: string) => {
    void fetchLabReport(token, organizationId, reportId)
      .then((body) => {
        setSelectedId(reportId);
        setDetail(body);
      })
      .catch(onError);
  };

  const startEntry = (reportId: string) => {
    setEntryReportId(reportId);
    setSummary('');
    setLine(emptyLine());
    setValidationError(null);
    setEntryView('idle');
    setEntryMessage(null);
    setSelectedId(reportId);
    void fetchLabReport(token, organizationId, reportId)
      .then(setDetail)
      .catch(onError);
  };

  const validateEntry = (): boolean => {
    if (!line.analyte_code.trim()) {
      setValidationError('Analyte code is required.');
      return false;
    }
    if (!line.analyte_name.trim()) {
      setValidationError('Analyte name is required.');
      return false;
    }
    if (!line.value.trim()) {
      setValidationError('Result value is required.');
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleApiEntryError = (err: unknown) => {
    if (err instanceof LabApiError) {
      if (err.status === 401) {
        onError(err);
        return;
      }
      if (err.status === 403) {
        setEntryView('forbidden');
        return;
      }
      if (err.status === 0) {
        setEntryView('network');
        return;
      }
      setEntryMessage(err.message);
      setEntryView('error');
      return;
    }
    setEntryView('network');
  };

  const submitEntry = () => {
    if (!entryReportId || !validateEntry()) {
      return;
    }
    setEntryView('submitting');
    setEntryMessage(null);
    void enterLabReportResults(token, organizationId, entryReportId, {
      summary: summary.trim() || undefined,
      lines: [
        {
          analyte_code: line.analyte_code.trim(),
          analyte_name: line.analyte_name.trim(),
          value: line.value.trim(),
          unit: line.unit.trim() || undefined,
        },
      ],
    })
      .then(() => submitLabReportVerify(token, organizationId, entryReportId))
      .then(() => {
        setEntryView('success');
        setEntryMessage('Results submitted for pathologist verification.');
        setEntryReportId(null);
        setSummary('');
        setLine(emptyLine());
        return load();
      })
      .catch(handleApiEntryError);
  };

  return (
    <div className="wp-stack">
      <header className="wp-page-header">
        <Heading level={2}>Pathology</Heading>
        <p className="wp-page-intro">
          Result entry for laboratory staff. Pathologist sign-off and publish happen on the pathologist portal
          (sandbox-pathologist@dev.local).
        </p>
      </header>
      <PortalKpiCards
        items={[
          { label: 'Reports', value: rows.length },
          { label: 'Drafts', value: rows.filter((row) => row.status === 'DRAFT').length },
          { label: 'Awaiting pathologist', value: rows.filter((row) => row.status === 'PENDING_VERIFY').length },
        ]}
      />
      <div className="wp-toolbar">
        <Button size="sm" variant="secondary" onClick={() => void load()}>
          Refresh pathology queue
        </Button>
      </div>
      {loading ? <LoadingState label="Loading pathology queue…" /> : null}
      {!loading && !rows.length ? (
        <EmptyState
          title="No pathology reports yet"
          description="Reports appear after accession and bench processing complete. If this lab has paid bookings, ask an operator to finish processing or reload after sandbox seed."
        />
      ) : null}
      {rows.map((row) => (
        <Card key={row.id}>
          <Text>
            {row.accession_number} · {row.test_title} · {row.status ?? '—'}
          </Text>
          <Button size="sm" variant="secondary" onClick={() => open(row.id)}>
            Open
          </Button>
          {row.status === 'DRAFT' ? (
            <Button size="sm" onClick={() => startEntry(row.id)}>
              Enter results
            </Button>
          ) : null}
          {row.status === 'PENDING_VERIFY' || row.status === 'VERIFIED' ? (
            <Text size="caption">
              Pathologist sign-off happens on the pathologist portal (port 3009) — lab staff cannot publish reports.
            </Text>
          ) : null}
        </Card>
      ))}
      {entryReportId ? (
        <Card>
          <Heading level={3}>Result entry</Heading>
          <Button
            size="sm"
            variant="tertiary"
            onClick={() => {
              setEntryReportId(null);
              setEntryView('idle');
              setValidationError(null);
              setEntryMessage(null);
            }}
          >
            Close
          </Button>
          <FormField label="Summary (optional)">
            {({ id }) => <Input id={id} value={summary} onChange={(e) => setSummary(e.target.value)} />}
          </FormField>
          <FormField label="Analyte code" required>
            {({ id }) => (
              <Input
                id={id}
                value={line.analyte_code}
                onChange={(e) => setLine((prev) => ({ ...prev, analyte_code: e.target.value }))}
                invalid={Boolean(validationError && !line.analyte_code.trim())}
              />
            )}
          </FormField>
          <FormField label="Analyte name" required>
            {({ id }) => (
              <Input
                id={id}
                value={line.analyte_name}
                onChange={(e) => setLine((prev) => ({ ...prev, analyte_name: e.target.value }))}
                invalid={Boolean(validationError && !line.analyte_name.trim())}
              />
            )}
          </FormField>
          <FormField label="Value" required>
            {({ id }) => (
              <Input
                id={id}
                value={line.value}
                onChange={(e) => setLine((prev) => ({ ...prev, value: e.target.value }))}
                invalid={Boolean(validationError && !line.value.trim())}
              />
            )}
          </FormField>
          <FormField label="Unit (optional)">
            {({ id }) => (
              <Input id={id} value={line.unit} onChange={(e) => setLine((prev) => ({ ...prev, unit: e.target.value }))} />
            )}
          </FormField>
          {validationError ? <Text tone="secondary">{validationError}</Text> : null}
          {entryView === 'submitting' ? <LoadingState label="Submitting results…" /> : null}
          {entryView === 'forbidden' ? <PermissionDeniedState /> : null}
          {entryView === 'network' ? (
            <NetworkErrorState action={{ label: 'Retry', onClick: () => submitEntry() }} />
          ) : null}
          {entryView === 'error' && entryMessage ? <Text tone="secondary">{entryMessage}</Text> : null}
          {entryView === 'success' && entryMessage ? <Text>{entryMessage}</Text> : null}
          {entryView !== 'submitting' && entryView !== 'success' ? (
            <Button size="sm" onClick={() => submitEntry()}>
              Submit for verification
            </Button>
          ) : null}
        </Card>
      ) : null}
      {detail && selectedId && !entryReportId ? (
        <Card>
          <Heading level={3}>Report detail</Heading>
          <Button size="sm" variant="tertiary" onClick={() => setDetail(null)}>
            Close
          </Button>
          <Text>
            {detail.accession_number} · {detail.test_title} · {detail.version?.status ?? '—'}
          </Text>
          {detail.version?.results.map((resultLine) => (
            <Text key={resultLine.analyte_code} size="caption">
              {resultLine.analyte_name}: {resultLine.value} {resultLine.unit ?? ''}
            </Text>
          ))}
        </Card>
      ) : null}
    </div>
  );
}

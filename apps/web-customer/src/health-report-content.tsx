'use client';

import { Card, Heading, Text } from '@world-pharma/ui-kit/web';
import type { HealthArtifactPayload, PrescriptionHealthPayload } from './health-api';
import type { ImagingCustomerReport } from './imaging-api';
import type { LabCustomerReport } from './lab-api';

function LabReportContent({ report }: { report: LabCustomerReport }) {
  return (
    <Card>
      <Heading level={3}>Diagnostic report</Heading>
      <Text size="caption">
        Accession {report.accession_number} · v{report.version_number}
      </Text>
      {report.summary ? <Text>{report.summary}</Text> : null}
      {report.results.map((line) => (
        <Text key={`${line.analyte_name}-${line.value}`} size="caption">
          {line.analyte_name}: {line.value}
          {line.unit ? ` ${line.unit}` : ''}
        </Text>
      ))}
      {report.note ? <Text size="caption">{report.note}</Text> : null}
    </Card>
  );
}

function ImagingReportContent({ report }: { report: ImagingCustomerReport }) {
  return (
    <Card>
      <Heading level={3}>Imaging report</Heading>
      {report.accession_number ? (
        <Text size="caption">
          Accession {report.accession_number} · v{report.version_number}
        </Text>
      ) : (
        <Text size="caption">Version {report.version_number}</Text>
      )}
      {report.summary ? <Text>{report.summary}</Text> : null}
      {report.amendment_reason ? <Text size="caption">Amendment: {report.amendment_reason}</Text> : null}
      {report.findings.map((line) => (
        <Text key={`${line.finding_code}-${line.finding_text}`} size="caption">
          {line.finding_code}: {line.finding_text}
        </Text>
      ))}
      {report.note ? <Text size="caption">{report.note}</Text> : null}
    </Card>
  );
}

export function HealthReportContent({ payload }: { payload: HealthArtifactPayload }) {
  if (payload.artifact_type === 'LAB_REPORT') {
    return <LabReportContent report={payload.payload as LabCustomerReport} />;
  }
  if (payload.artifact_type === 'IMAGING_REPORT') {
    return <ImagingReportContent report={payload.payload as ImagingCustomerReport} />;
  }
  if (payload.artifact_type === 'PRESCRIPTION_STRUCTURED') {
    const report = (payload as { artifact_type: 'PRESCRIPTION_STRUCTURED'; payload: PrescriptionHealthPayload })
      .payload;
    if (!report.lines.length) {
      return null;
    }
    return (
      <Card>
        <Heading level={3}>Prescription</Heading>
        <Text size="caption">{`Version ${report.version_number}`}</Text>
        {report.lines.map((line, index) => (
          <Text key={`${line.clinical_concept_label}-${index}`} size="caption">
            {`${line.clinical_concept_label} · ${line.dosage_instructions}${line.quantity_authorized ? ` · qty ${line.quantity_authorized}` : ''}`}
          </Text>
        ))}
      </Card>
    );
  }
  if (payload.artifact_type === 'DOCUMENT' || payload.artifact_type === 'PRESCRIPTION_UPLOAD') {
    const upload = payload.payload as {
      original_name: string;
      content_type: string;
      byte_size: number;
      uploaded_at: string;
    };
    return (
      <Card>
        <Heading level={3}>{payload.artifact_type === 'DOCUMENT' ? 'Uploaded document' : 'Uploaded prescription'}</Heading>
        <Text size="caption">
          {upload.original_name} · {upload.content_type} · {upload.byte_size} bytes
        </Text>
        <Text size="caption">Uploaded {new Date(upload.uploaded_at).toLocaleString()}</Text>
        <Text size="caption" tone="secondary">
          This upload is stored securely and is not used for automated diagnosis or prescribing.
        </Text>
      </Card>
    );
  }
  return null;
}

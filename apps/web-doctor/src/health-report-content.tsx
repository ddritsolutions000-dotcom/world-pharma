'use client';

import { Card, Heading, Text } from '@world-pharma/ui-kit/web';
import type { HealthArtifactPayload } from './health-api';

export function HealthReportContent({ payload }: { payload: HealthArtifactPayload }) {
  if (payload.artifact_type === 'LAB_REPORT' && payload.payload.results?.length) {
    return (
      <Card>
        <Heading level={3}>Lab diagnostic report</Heading>
        {payload.payload.summary ? <Text>{payload.payload.summary}</Text> : null}
        {payload.payload.results.map((line) => (
          <Text key={`${line.analyte_name}-${line.value}`} size="caption">
            {line.analyte_name}: {line.value}
            {line.unit ? ` ${line.unit}` : ''}
          </Text>
        ))}
        {payload.payload.note ? <Text size="caption">{payload.payload.note}</Text> : null}
      </Card>
    );
  }
  if (payload.artifact_type === 'IMAGING_REPORT' && payload.payload.findings?.length) {
    return (
      <Card>
        <Heading level={3}>Imaging report</Heading>
        {payload.payload.summary ? <Text>{payload.payload.summary}</Text> : null}
        {payload.payload.findings.map((line) => (
          <Text key={`${line.finding_code}-${line.finding_text}`} size="caption">
            {line.finding_code}: {line.finding_text}
          </Text>
        ))}
        {payload.payload.note ? <Text size="caption">{payload.payload.note}</Text> : null}
      </Card>
    );
  }
  if (payload.artifact_type === 'PRESCRIPTION_STRUCTURED' && payload.payload.lines?.length) {
    return (
      <Card>
        <Heading level={3}>Prescription</Heading>
        <Text size="caption">{`Version ${payload.payload.version_number ?? '—'}`}</Text>
        {payload.payload.lines.map((line, index) => (
          <Text key={`${line.clinical_concept_label}-${index}`} size="caption">
            {`${line.clinical_concept_label} · ${line.dosage_instructions}${line.quantity_authorized ? ` · qty ${line.quantity_authorized}` : ''}`}
          </Text>
        ))}
      </Card>
    );
  }
  return (
    <Card>
      <Text tone="secondary">Report content is not available in a recognized format.</Text>
    </Card>
  );
}

const REPORT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_VERIFY: 'Pending verification',
  VERIFIED: 'Verified',
  PUBLISHED: 'Published',
  SUPERSEDED: 'Superseded',
  AMENDED: 'Amended',
};

export function clinicalReportStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return 'Unassigned';
  }
  return REPORT_STATUS_LABELS[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export type ClinicalReportNextAction = 'assign' | 'save' | 'submit' | 'verify' | 'publish' | 'amend' | null;

export function clinicalReportNextAction(status: string | null | undefined): ClinicalReportNextAction {
  if (!status) {
    return 'assign';
  }
  if (status === 'DRAFT') {
    return 'save';
  }
  if (status === 'PENDING_VERIFY') {
    return 'verify';
  }
  if (status === 'VERIFIED') {
    return 'publish';
  }
  if (status === 'PUBLISHED') {
    return 'amend';
  }
  return null;
}

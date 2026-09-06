export const JOIN_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  REGISTERED: 'Registered',
  PROFILE_INCOMPLETE: 'Profile incomplete',
  DOCUMENTS_REQUIRED: 'Documents required',
  DOCUMENTS_SUBMITTED: 'Submitted — under company review',
  UNDER_REVIEW: 'Under review',
  ADDITIONAL_INFORMATION_REQUIRED: 'Action required',
  VERIFIED: 'Verified',
  APPROVED: 'Approved',
  ACTIVE: 'Active — seller access granted',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
  BLOCKED: 'Blocked',
  DEACTIVATED: 'Deactivated',
  REACTIVATION_REQUESTED: 'Reactivation requested',
};

export function joinStatusLabel(status: string): string {
  return JOIN_STATUS_LABELS[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function joinStatusNextAction(status: string): string | null {
  switch (status) {
    case 'DRAFT':
    case 'REGISTERED':
    case 'PROFILE_INCOMPLETE':
    case 'DOCUMENTS_REQUIRED':
      return 'Upload required documents and submit your vendor application.';
    case 'ADDITIONAL_INFORMATION_REQUIRED':
      return 'Review the company request, update documents if needed, and resubmit.';
    case 'DOCUMENTS_SUBMITTED':
    case 'UNDER_REVIEW':
    case 'VERIFIED':
      return 'Your application is with World Pharma operations. No action needed unless contacted.';
    case 'APPROVED':
    case 'ACTIVE':
      return 'Sign in to the seller workspace with the same email using OTP.';
    case 'REJECTED':
      return 'This application was not approved. Contact support if you believe this is an error.';
    default:
      return null;
  }
}

export function countryDisplayName(row: { name: Record<string, string> | string }): string {
  if (typeof row.name === 'string') {
    return row.name;
  }
  return row.name.en ?? row.name.default ?? Object.values(row.name)[0] ?? '—';
}

/** Human-readable labels for existing PartnerStatus values — no new enum. */
export const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  REGISTERED: 'Registered',
  PROFILE_INCOMPLETE: 'Profile incomplete',
  DOCUMENTS_REQUIRED: 'Documents required',
  DOCUMENTS_SUBMITTED: 'Submitted — under company review',
  UNDER_REVIEW: 'Under review',
  ADDITIONAL_INFORMATION_REQUIRED: 'Action required',
  VERIFIED: 'Verified',
  APPROVED: 'Approved',
  ACTIVE: 'Active — portal access granted',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
  BLOCKED: 'Blocked',
  DEACTIVATED: 'Deactivated',
  REACTIVATION_REQUESTED: 'Reactivation requested',
};

/** Mirrors API partner state-machine allowed next statuses (admin UI affordance only). */
export const PARTNER_NEXT_STATUSES: Record<string, string[]> = {
  DRAFT: ['REGISTERED', 'REJECTED'],
  REGISTERED: ['PROFILE_INCOMPLETE', 'DOCUMENTS_REQUIRED', 'REJECTED'],
  PROFILE_INCOMPLETE: ['DOCUMENTS_REQUIRED', 'REJECTED'],
  DOCUMENTS_REQUIRED: ['DOCUMENTS_SUBMITTED', 'REJECTED'],
  DOCUMENTS_SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['ADDITIONAL_INFORMATION_REQUIRED', 'VERIFIED', 'REJECTED', 'BLOCKED'],
  ADDITIONAL_INFORMATION_REQUIRED: ['DOCUMENTS_SUBMITTED', 'UNDER_REVIEW', 'REJECTED'],
  VERIFIED: ['APPROVED', 'SUSPENDED', 'DEACTIVATED', 'BLOCKED'],
  APPROVED: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'BLOCKED'],
  ACTIVE: ['SUSPENDED', 'DEACTIVATED', 'BLOCKED'],
  REJECTED: [],
  SUSPENDED: ['REACTIVATION_REQUESTED', 'BLOCKED', 'DEACTIVATED'],
  BLOCKED: [],
  DEACTIVATED: ['REACTIVATION_REQUESTED'],
  REACTIVATION_REQUESTED: ['UNDER_REVIEW', 'ACTIVE', 'REJECTED', 'BLOCKED'],
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function canPartnerTransition(from: string, to: string): boolean {
  return (PARTNER_NEXT_STATUSES[from] ?? []).includes(to);
}

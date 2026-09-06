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

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function statusNextAction(status: string): string | null {
  switch (status) {
    case 'DRAFT':
    case 'REGISTERED':
    case 'PROFILE_INCOMPLETE':
    case 'DOCUMENTS_REQUIRED':
      return 'Upload required documents and submit your application.';
    case 'ADDITIONAL_INFORMATION_REQUIRED':
      return 'Review the company request, update documents if needed, and resubmit.';
    case 'DOCUMENTS_SUBMITTED':
    case 'UNDER_REVIEW':
    case 'VERIFIED':
      return 'Your application is with World-Pharma operations. No action needed unless contacted.';
    case 'APPROVED':
    case 'ACTIVE':
      return 'Sign in to your partner portal with the same email using OTP.';
    case 'REJECTED':
      return 'This application was not approved. Contact support if you believe this is an error.';
    default:
      return null;
  }
}

export function portalUrlForPartnerType(partnerTypeCode: string): string | null {
  if (partnerTypeCode === 'VENDOR') {
    return process.env.NEXT_PUBLIC_VENDOR_PORTAL_URL ?? 'http://localhost:3004';
  }
  if (partnerTypeCode === 'PHARMACY') {
    return process.env.NEXT_PUBLIC_STORE_PORTAL_URL ?? 'http://localhost:3003';
  }
  if (partnerTypeCode === 'LAB') {
    return process.env.NEXT_PUBLIC_LAB_PORTAL_URL ?? 'http://localhost:3005';
  }
  if (partnerTypeCode === 'IMAGING_CENTER') {
    return process.env.NEXT_PUBLIC_RADIOLOGY_PORTAL_URL ?? 'http://localhost:3006';
  }
  if (partnerTypeCode === 'DOCTOR') {
    return process.env.NEXT_PUBLIC_DOCTOR_PORTAL_URL ?? 'http://localhost:3002';
  }
  if (partnerTypeCode === 'DELIVERY_PARTNER') {
    return process.env.NEXT_PUBLIC_DELIVERY_APP_URL ?? 'exp://localhost:8087';
  }
  if (partnerTypeCode === 'AFFILIATE') {
    return process.env.NEXT_PUBLIC_AFFILIATE_PORTAL_URL ?? 'http://localhost:3010';
  }
  return null;
}

/** Pharmacy licence self-service lives on vendor onboarding — VENDOR and PHARMACY both use this. */
export function pharmacyLicencePortalUrl(partnerTypeCode: string): string | null {
  if (partnerTypeCode !== 'VENDOR' && partnerTypeCode !== 'PHARMACY') {
    return null;
  }
  const root = (process.env.NEXT_PUBLIC_VENDOR_PORTAL_URL ?? 'http://localhost:3004').replace(/\/$/, '');
  return `${root}/join/status`;
}

export function portalLabelForPartnerType(partnerTypeCode: string): string {
  if (partnerTypeCode === 'PHARMACY') {
    return 'Pharmacy store portal';
  }
  if (partnerTypeCode === 'VENDOR') {
    return 'Vendor seller portal';
  }
  if (partnerTypeCode === 'LAB') {
    return 'Lab operations portal';
  }
  if (partnerTypeCode === 'IMAGING_CENTER') {
    return 'Imaging center portal';
  }
  if (partnerTypeCode === 'DOCTOR') {
    return 'Doctor operations portal';
  }
  if (partnerTypeCode === 'DELIVERY_PARTNER') {
    return 'Delivery partner app';
  }
  if (partnerTypeCode === 'AFFILIATE') {
    return 'Affiliate operations portal';
  }
  return 'Partner portal';
}

export function partnerTypeLabel(code: string): string {
  if (code === 'PHARMACY') {
    return 'Pharmacy operator';
  }
  if (code === 'VENDOR') {
    return 'Marketplace vendor seller';
  }
  if (code === 'LAB') {
    return 'Diagnostic laboratory';
  }
  if (code === 'IMAGING_CENTER') {
    return 'Imaging center';
  }
  if (code === 'DOCTOR') {
    return 'Doctor / healthcare professional';
  }
  if (code === 'DELIVERY_PARTNER') {
    return 'Delivery partner';
  }
  if (code === 'AFFILIATE') {
    return 'Affiliate partner';
  }
  return code;
}

export function isAcquisitionPartnerType(code: string): boolean {
  return (
    code === 'VENDOR' ||
    code === 'PHARMACY' ||
    code === 'LAB' ||
    code === 'IMAGING_CENTER' ||
    code === 'DOCTOR' ||
    code === 'DELIVERY_PARTNER' ||
    code === 'AFFILIATE'
  );
}

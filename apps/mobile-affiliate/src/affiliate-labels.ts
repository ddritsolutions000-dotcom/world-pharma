/** Commission / liability labels aligned with S149 affiliate-visible states — no invented payout actions. */
const EARNING_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved — awaiting payout batch',
  PAYABLE: 'Payable (sandbox)',
  PAID: 'Paid',
  REVERSED: 'Reversed',
  BLOCKED: 'Blocked',
  HELD: 'Held',
  SUBMITTED: 'Submitted',
  PROCESSING: 'Processing',
  FAILED: 'Failed',
  ADJUSTED: 'Adjusted',
};

export function earningStatusLabel(status: string): string {
  return EARNING_STATUS_LABELS[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function referralStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

export function payoutStatusLabel(status: string | undefined, payoutEnabled: boolean): string {
  if (payoutEnabled) {
    return status ? status.replaceAll('_', ' ').toLowerCase() : 'Enabled';
  }
  if (!status || status === 'external_gated') {
    return 'External-gated (no live payout)';
  }
  return status.replaceAll('_', ' ').toLowerCase();
}

export function kycStatusSummary(input: {
  payout_enabled: boolean;
  payout_status?: string;
  clinical_blocked_default?: boolean;
}): { headline: string; detail: string } {
  return {
    headline: 'Verification / KYC',
    detail:
      'Partner KYC/KYB evidence is not shown in this app. Status follows Join + admin gates (S150). ' +
      (input.payout_enabled
        ? 'Payout rails reported enabled for this sandbox account.'
        : `Payout: ${payoutStatusLabel(input.payout_status, false)}. Production payout remains EXTERNAL_GATED.`),
  };
}

/** Format minor currency units using ISO 4217 codes. */
export function formatMoney(minor: string | number | null | undefined, currency = 'XXX'): string {
  if (minor === null || minor === undefined || minor === '') {
    return '—';
  }
  const value = typeof minor === 'string' ? Number(minor) : minor;
  if (!Number.isFinite(value)) {
    return '—';
  }
  const major = value / 100;
  const code = currency.toUpperCase();
  if (code === 'XXX') {
    return major.toLocaleString(undefined, {
      minimumFractionDigits: major % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: major % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${code} ${major.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function resolveShareUrl(
  relativeOrAbsolute: string,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  if (relativeOrAbsolute.startsWith('http://') || relativeOrAbsolute.startsWith('https://')) {
    return relativeOrAbsolute;
  }
  const appEnv = (env['EXPO_PUBLIC_APP_ENV'] ?? 'local').trim().toLowerCase();
  const configured = (env['EXPO_PUBLIC_CUSTOMER_URL'] ?? '').trim().replace(/\/$/, '');
  const path = relativeOrAbsolute.startsWith('/') ? relativeOrAbsolute : `/${relativeOrAbsolute}`;

  // Fail closed: never bake localhost into production/sandbox share links.
  if (appEnv === 'production' || appEnv === 'sandbox') {
    if (!configured || /localhost|127\.0\.0\.1/i.test(configured)) {
      return path;
    }
    return `${configured}${path}`;
  }

  const base = configured || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}${path}`;
}

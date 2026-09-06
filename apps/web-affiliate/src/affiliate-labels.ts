const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending company review',
  APPROVED: 'Approved — awaiting payout batch',
  PAYABLE: 'Payable (sandbox)',
  PAID: 'Paid',
  REVERSED: 'Reversed',
  BLOCKED: 'Blocked',
};

export function earningStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

export function referralCodeStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

export function supportTicketStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

export function fullShareUrl(
  relativePath: string,
  env: Record<string, string | undefined> = {
    NEXT_PUBLIC_CUSTOMER_URL: process.env.NEXT_PUBLIC_CUSTOMER_URL,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NODE_ENV: process.env.NODE_ENV,
  },
): string {
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) {
    return relativePath;
  }
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  const appEnv = (env.NEXT_PUBLIC_APP_ENV ?? env.NODE_ENV ?? 'development').trim().toLowerCase();
  const configured = (env.NEXT_PUBLIC_CUSTOMER_URL ?? '').trim().replace(/\/$/, '');

  // Fail closed: never bake doctor-port or localhost into sandbox/production share links.
  if (appEnv === 'production' || appEnv === 'sandbox') {
    if (!configured || /localhost|127\.0\.0\.1/i.test(configured)) {
      return path;
    }
    return `${configured}${path}`;
  }

  // Local default is customer SPA (:3000), not doctor (:3002).
  const base = configured || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}${path}`;
}

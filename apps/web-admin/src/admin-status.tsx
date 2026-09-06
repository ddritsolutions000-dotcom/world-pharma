import type { StatusKind } from '@world-pharma/ui-kit/web';
import { Badge } from '@world-pharma/ui-kit/web';

const STATUS_KIND: Record<string, StatusKind> = {
  ACTIVE: 'success',
  APPROVED: 'success',
  COMPLETED: 'success',
  VERIFIED: 'verified',
  PAID: 'success',
  INACTIVE: 'unavailable',
  DISABLED: 'unavailable',
  SUSPENDED: 'restricted',
  REJECTED: 'error',
  FAILED: 'error',
  CANCELLED: 'expired',
  REFUNDED: 'info',
  PENDING: 'pending',
  PROCESSING: 'pending',
  OPEN: 'warning',
  INVESTIGATING: 'warning',
  SUBMITTED: 'pending',
  DRAFT: 'info',
};

export function statusKind(raw: string | null | undefined): StatusKind {
  if (!raw) {
    return 'info';
  }
  const key = raw.trim().toUpperCase().replace(/\s+/g, '_');
  return STATUS_KIND[key] ?? 'info';
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) {
    return <>—</>;
  }
  return <Badge kind={statusKind(status)}>{status.replace(/_/g, ' ')}</Badge>;
}

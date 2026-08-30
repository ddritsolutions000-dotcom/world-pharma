import { cx } from './cx';
import { Icon, type IconName } from './icon';

export type StatusKind =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'pending'
  | 'rx'
  | 'panic'
  | 'cod'
  | 'verified'
  | 'restricted'
  | 'expired'
  | 'urgent'
  | 'confidential'
  | 'unavailable';

const badgeClass: Record<StatusKind, string> = {
  success: 'wp-badge-success',
  warning: 'wp-badge-warning',
  error: 'wp-badge-error',
  info: 'wp-badge-info',
  pending: 'wp-badge-warning',
  rx: 'wp-badge-rx',
  panic: 'wp-badge-panic',
  cod: 'wp-badge-cod',
  verified: 'wp-badge-verified',
  restricted: 'wp-badge-warning',
  expired: 'wp-badge-warning',
  urgent: 'wp-badge-panic',
  confidential: 'wp-badge-info',
  unavailable: 'wp-badge-warning',
};

const badgeIcon: Record<StatusKind, IconName> = {
  success: 'check',
  warning: 'warning',
  error: 'error',
  info: 'info',
  pending: 'clock',
  rx: 'rx',
  panic: 'panic',
  cod: 'lock',
  verified: 'verified',
  restricted: 'lock',
  expired: 'clock',
  urgent: 'warning',
  confidential: 'shield',
  unavailable: 'warning',
};

const badgeLabel: Record<StatusKind, string> = {
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
  info: 'Info',
  pending: 'Pending',
  rx: 'Prescription required',
  panic: 'Urgent clinical',
  cod: 'Cash on delivery',
  verified: 'Verified',
  restricted: 'Restricted',
  expired: 'Expired',
  urgent: 'Urgent',
  confidential: 'Confidential',
  unavailable: 'Unavailable',
};

export function Badge({
  kind,
  children,
}: {
  kind: StatusKind;
  children?: React.ReactNode;
}): React.JSX.Element {
  const text = children ?? badgeLabel[kind];
  return (
    <span className={cx('wp-badge', badgeClass[kind])}>
      <Icon name={badgeIcon[kind]} size="sm" decorative />
      {text}
    </span>
  );
}

export function Chip({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove?: () => void;
}) {
  return (
    <span className="wp-chip">
      {children}
      {onRemove ? (
        <button type="button" className="wp-icon-btn" aria-label="Remove" onClick={onRemove}>
          <Icon name="close" size="sm" label="Remove" />
        </button>
      ) : null}
    </span>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span className="wp-avatar" style={{ width: size, height: size }} aria-hidden="true">
      {initials || '?'}
    </span>
  );
}

export function Card({
  raised = false,
  className,
  children,
}: {
  raised?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cx('wp-card', raised && 'wp-card-raised', className)}>{children}</div>;
}

export function Divider() {
  return <hr className="wp-divider" />;
}

export function StatusDot({ kind, label }: { kind: StatusKind; label?: string }) {
  return <Badge kind={kind}>{label}</Badge>;
}

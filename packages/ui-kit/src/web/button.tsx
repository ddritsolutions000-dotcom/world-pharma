'use client';

import type { ButtonHTMLAttributes } from 'react';
import { cx, omitPopover } from './cx';
import { Icon } from './icon';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md';

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  type = 'button',
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}): React.JSX.Element {
  const busy = loading || disabled;
  return (
    <button
      type={type}
      className={cx('wp-btn', `wp-btn-${variant}`, size === 'sm' && 'wp-btn-sm', className)}
      disabled={busy}
      aria-busy={loading || undefined}
      {...omitPopover(rest)}
    >
      {loading ? <Icon name="spinner" size="sm" label="Loading" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; loading?: boolean }): React.JSX.Element {
  return (
    <button
      type="button"
      className={cx('wp-icon-btn', className)}
      aria-label={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...omitPopover(rest)}
    >
      {loading ? <Icon name="spinner" size="sm" label={label} /> : children}
    </button>
  );
}

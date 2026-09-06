import Link from 'next/link';
import type { ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'tertiary';
type Size = 'sm' | 'md';

function btnClass(variant: Variant, size: Size, className?: string): string {
  return ['wp-btn', `wp-btn-${variant}`, size === 'sm' ? 'wp-btn-sm' : '', 'vendor-cta-link', className]
    .filter(Boolean)
    .join(' ');
}

/** Anchor styled as ui-kit button — avoids invalid <a><button> nesting. */
export function VendorCtaLink({
  href,
  variant = 'primary',
  size = 'md',
  external = false,
  children,
  onClick,
  className,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  external?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const cls = btnClass(variant, size, className);
  const isExternal = external || href.startsWith('http://') || href.startsWith('https://');

  if (isExternal) {
    return (
      <a href={href} className={cls} target="_blank" rel="noreferrer" onClick={onClick}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={cls} onClick={onClick}>
      {children}
    </Link>
  );
}

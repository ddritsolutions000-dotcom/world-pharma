import type { ReactNode } from 'react';
import Link from 'next/link';

export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mg-page ${className}`.trim()}>{children}</div>;
}

export function MgBackLink({ href, children = '← Back' }: { href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="mg-back-link">
      {children}
    </Link>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return <ServiceHero title={title} subtitle={subtitle} actions={actions} compact />;
}

export function ServiceHero({
  kicker,
  title,
  subtitle,
  tone,
  compact,
  actions,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  tone?: 'lab' | 'scan' | 'wellness' | 'care';
  compact?: boolean;
  actions?: ReactNode;
}) {
  const className = [
    'mg-service-hero',
    compact ? 'mg-service-hero--compact' : '',
    tone ? `mg-service-hero--${tone}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <section className={className} aria-label={title}>
      {kicker ? <p className="mg-service-kicker">{kicker}</p> : null}
      <h1 className="mg-service-title">{title}</h1>
      {subtitle ? <p className="mg-service-sub">{subtitle}</p> : null}
      {actions ? <div className="mg-service-actions">{actions}</div> : null}
    </section>
  );
}

export function PageIntro({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mg-page-intro ${className}`.trim()}>{children}</div>;
}

export function Section({
  title,
  description,
  seeAllHref,
  children,
  className = '',
}: {
  title?: string;
  description?: string;
  seeAllHref?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mg-section ${className}`.trim()}>
      {title ? (
        <div className="mg-section-head">
          <div>
            <h2 className="mg-section-title">{title}</h2>
            {description ? <p className="mg-section-desc">{description}</p> : null}
          </div>
          {seeAllHref ? (
            <Link href={seeAllHref} className="mg-section-link">
              See all
            </Link>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function MgCard({ children, flat = false, className = '' }: { children: ReactNode; flat?: boolean; className?: string }) {
  return <div className={`mg-card${flat ? ' mg-card--flat' : ''} ${className}`.trim()}>{children}</div>;
}

type BtnProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md';
  block?: boolean;
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
  disabled?: boolean;
};

export function MgBtn({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  href,
  onClick,
  type = 'button',
  className = '',
  disabled = false,
}: BtnProps) {
  const cls = [
    'mg-btn',
    `mg-btn--${variant}`,
    size === 'sm' ? 'mg-btn--sm' : '',
    block ? 'mg-btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (href && !disabled) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function MgInput({
  value,
  onChange,
  placeholder,
  label,
  type = 'text',
  className = '',
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  label?: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      className={`mg-input ${className}`.trim()}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      placeholder={placeholder}
      aria-label={label ?? placeholder}
    />
  );
}

import { cx } from './cx';

type Tone = 'primary' | 'secondary' | 'muted';

const toneClass: Record<Tone, string | undefined> = {
  primary: undefined,
  secondary: 'wp-text-secondary',
  muted: 'wp-text-muted',
};

export function Text({
  as: Tag = 'p',
  size = 'body',
  tone = 'primary',
  tabular = false,
  className,
  children,
}: {
  as?: 'p' | 'span' | 'div';
  size?: 'bodyLg' | 'body' | 'bodySm' | 'label' | 'caption';
  tone?: Tone;
  tabular?: boolean;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const sizeClass =
    size === 'bodyLg'
      ? 'wp-text-body-lg'
      : size === 'bodySm'
        ? 'wp-text-body-sm'
        : `wp-text-${size === 'label' ? 'label' : size === 'caption' ? 'caption' : 'body'}`;
  return (
    <Tag className={cx('wp-text', sizeClass, toneClass[tone], tabular && 'wp-text-tabular', className)}>
      {children}
    </Tag>
  );
}

export function Heading({
  level = 1,
  className,
  children,
}: {
  level?: 1 | 2 | 3 | 4;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const Tag = (`h${level}` as const);
  return <Tag className={cx('wp-text', `wp-text-h${level}`, className)}>{children}</Tag>;
}

export function Display({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cx('wp-text', 'wp-text-display', className)}>{children}</p>;
}

export function Label({
  htmlFor,
  required,
  children,
  className,
}: {
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cx('wp-label', className)} htmlFor={htmlFor}>
      {children}
      {required ? (
        <span className="wp-required" aria-hidden="true">
          *
        </span>
      ) : null}
    </label>
  );
}

export function HelperText({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="wp-help">
      {children}
    </p>
  );
}

export function ErrorText({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="wp-error-text" role="alert">
      {children}
    </p>
  );
}

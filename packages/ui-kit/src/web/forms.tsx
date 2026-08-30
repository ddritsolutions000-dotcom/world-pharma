'use client';

import { useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx, omitPopover } from './cx';
import { ErrorText, HelperText, Label } from './text';

type FieldMeta = {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
};

export function FormField({
  label,
  hint,
  error,
  required,
  children,
}: FieldMeta & { children: (ids: { id: string; describedBy?: string }) => React.ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="wp-field">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children({ id, describedBy })}
      {hint ? <HelperText id={hintId}>{hint}</HelperText> : null}
      {error ? <ErrorText id={errorId}>{error}</ErrorText> : null}
    </div>
  );
}

export function Input(
  props: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean },
): React.JSX.Element {
  const { invalid, className, ...rest } = props;
  return (
    <input
      className={cx('wp-input', className)}
      aria-invalid={invalid || undefined}
      {...omitPopover(rest)}
    />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  const { invalid, className, ...rest } = props;
  return <textarea className={cx('wp-textarea', className)} aria-invalid={invalid || undefined} {...omitPopover(rest)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  const { invalid, className, children, ...rest } = props;
  return (
    <select className={cx('wp-select', className)} aria-invalid={invalid || undefined} {...omitPopover(rest)}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <label className="wp-check" htmlFor={id}>
      <input id={id} type="checkbox" {...omitPopover(rest)} />
      <span>{label}</span>
    </label>
  );
}

export function Radio({
  label,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <label className="wp-radio" htmlFor={id}>
      <input id={id} type="radio" {...omitPopover(rest)} />
      <span>{label}</span>
    </label>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <div className="wp-row">
      <button
        type="button"
        className="wp-switch"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onCheckedChange(!checked)}
      >
        <span className="wp-switch-thumb" />
      </button>
      <span className="wp-text-body-sm">{label}</span>
    </div>
  );
}

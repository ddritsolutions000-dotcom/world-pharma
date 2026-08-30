'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icon';

export type FeedbackTone = 'success' | 'info' | 'warning' | 'error';

const toneIcon: Record<FeedbackTone, IconName> = {
  success: 'check',
  info: 'info',
  warning: 'warning',
  error: 'error',
};

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: FeedbackTone;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cx('wp-alert', `wp-alert-${tone}`)} role="status">
      <Icon name={toneIcon[tone]} size="md" decorative />
      <div>
        <div className="wp-text-label">{title}</div>
        {children ? <div className="wp-text-body-sm">{children}</div> : null}
      </div>
    </div>
  );
}

export function Banner(props: { tone?: FeedbackTone; title: string; children?: React.ReactNode }) {
  return <Alert {...props} />;
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="wp-spinner">
      <Icon name="spinner" label={label} />
    </span>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="wp-sr-only">{label}</div>
      <div className="wp-progress" role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <span style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export function Skeleton({ width = '100%', height = 12, label = 'Loading' }: { width?: string | number; height?: number; label?: string }) {
  return <div className="wp-skeleton" style={{ width, height }} aria-label={label} />;
}

interface ToastItem {
  id: number;
  tone: FeedbackTone;
  title: string;
}

const ToastContext = createContext<{ push: (tone: FeedbackTone, title: string) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: FeedbackTone, title: string) => {
    const id = Date.now();
    setItems((curr) => [...curr, { id, tone, title }]);
    window.setTimeout(() => setItems((curr) => curr.filter((t) => t.id !== id)), 4000);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="wp-toast-region" aria-live="polite" aria-relevant="additions">
        {items.map((item) => (
          <div key={item.id} className="wp-toast">
            <Alert tone={item.tone} title={item.title} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): { push: (tone: FeedbackTone, title: string) => void } {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}

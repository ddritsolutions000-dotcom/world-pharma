'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, IconButton } from './button';
import { Icon } from './icon';
import { Heading, Text } from './text';

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="wp-tooltip" title={label}>
      {children}
    </span>
  );
}

export function Popover({
  trigger,
  children,
}: {
  trigger: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="wp-tooltip">
      <span onClick={() => setOpen((v) => !v)}>{trigger}</span>
      {open ? <div className="wp-popover">{children}</div> : null}
    </span>
  );
}

export function Dropdown({
  label,
  items,
}: {
  label: string;
  items: Array<{ id: string; label: string; onSelect: () => void }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="wp-tooltip">
      <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
        {label}
        <Icon name="chevronDown" size="sm" decorative />
      </Button>
      {open ? (
        <div className="wp-popover" role="menu">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="wp-dropdown-item"
              role="menuitem"
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const node = ref.current;
    const focusable = node?.querySelector<HTMLElement>('button, [href], input, select, textarea');
    focusable?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) {
    return null;
  }
  return (
    <div className="wp-overlay" onClick={onClose}>
      <div
        className="wp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wp-row" style={{ justifyContent: 'space-between' }}>
          <Heading level={3}>{title}</Heading>
          <IconButton label="Close" onClick={onClose}>
            <Icon name="close" label="Close" />
          </IconButton>
        </div>
        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

export function BottomSheet({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }
  return (
    <div className="wp-overlay" onClick={onClose}>
      <div className="wp-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <Heading level={3}>{title}</Heading>
        <Text size="bodySm" tone="secondary">
          Swipe down or use close on device back when wired by the app shell.
        </Text>
        {children}
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './icon';

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="wp-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="wp-tab"
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="wp-segment" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={cx('wp-tab', value === opt.id && 'wp-tab')}
          role="radio"
          aria-checked={value === opt.id}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function HeaderBar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="wp-nav-header">
      <strong>{title}</strong>
      <div className="wp-row" style={{ marginInlineStart: 'auto' }}>
        {children}
      </div>
    </header>
  );
}

export function Sidebar({
  items,
  current,
}: {
  items: Array<{ id: string; label: string; icon?: IconName }>;
  current?: string;
}) {
  return (
    <nav className="wp-nav-side" aria-label="Sidebar">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="wp-nav-item"
          aria-current={current === item.id ? 'page' : undefined}
        >
          {item.icon ? <Icon name={item.icon} size="sm" decorative /> : null}
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function BottomNav({
  items,
  current,
}: {
  items: Array<{ id: string; label: string; icon: IconName }>;
  current?: string;
}) {
  return (
    <nav className="wp-nav-bottom" aria-label="Primary">
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="wp-nav-item"
          aria-current={current === item.id ? 'page' : undefined}
        >
          <Icon name={item.icon} size="sm" decorative />
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function Breadcrumbs({ items }: { items: Array<{ href?: string; label: string }> }) {
  return (
    <nav className="wp-crumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={item.label}>
          {item.href ? <a href={item.href}>{item.label}</a> : <span aria-current="page">{item.label}</span>}
          {index < items.length - 1 ? ' / ' : null}
        </span>
      ))}
    </nav>
  );
}

export function DemoTabs() {
  const [value, setValue] = useState('one');
  return (
    <Tabs
      value={value}
      onChange={setValue}
      tabs={[
        { id: 'one', label: 'Overview' },
        { id: 'two', label: 'Tokens' },
      ]}
    />
  );
}

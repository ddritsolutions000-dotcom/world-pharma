'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ShellNavItem } from '@world-pharma/shell-core';
import { Input } from '@world-pharma/ui-kit/web';
import { filterNavItems, groupedAdminNav } from './admin-nav-groups';

const COLLAPSE_KEY = 'wp-admin-nav-collapsed';

function readCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function AdminSidebar({
  items,
  activeId,
}: {
  items: ShellNavItem[];
  activeId: string;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const filtered = filterNavItems(items, query);
  const groups = groupedAdminNav(filtered);

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id];
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <nav className="wp-admin-side" aria-label="Admin modules">
      <div className="wp-admin-side-head">
        <p className="wp-admin-side-kicker">Modules</p>
        <Input
          aria-label="Filter modules"
          placeholder="Filter modules"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="wp-admin-side-scroll">
        {groups.map((group) => {
          const isCollapsed = !query && collapsed.includes(group.id);
          return (
            <div key={group.id} className="wp-admin-nav-group">
              <button
                type="button"
                className="wp-admin-nav-heading"
                aria-expanded={!isCollapsed}
                onClick={() => toggle(group.id)}
              >
                {group.label}
                <span aria-hidden="true">{isCollapsed ? '+' : '–'}</span>
              </button>
              {isCollapsed ? null : (
                <div className="wp-admin-nav-links">
                  {group.items.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="wp-nav-item wp-admin-nav-link"
                      aria-current={activeId === item.id ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 ? <p className="wp-text-muted">No modules match.</p> : null}
      </div>
    </nav>
  );
}

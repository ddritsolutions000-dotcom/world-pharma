'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ShellNavItem } from '@world-pharma/shell-core';
import { Button, Input, LoadingState, Text } from '@world-pharma/ui-kit/web';
import { adminJson, AdminHttpError } from './admin-http';
import { useSession } from '@world-pharma/shell-web';
import { filterNavItems } from './admin-nav-groups';
import { marketCountryPickerValue } from './working-country';

type EntityHit = {
  entity_type: string;
  id: string;
  label: string;
  status: string | null;
  country_code: string | null;
  href: string;
};

const RECENT_KEY = 'wp-admin-recent-entities';

function readRecent(): EntityHit[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as EntityHit[];
  } catch {
    return [];
  }
}

function pushRecent(hit: EntityHit) {
  const next = [hit, ...readRecent().filter((row) => row.id !== hit.id || row.entity_type !== hit.entity_type)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function AdminCommandPalette({
  items,
  open,
  onClose,
}: {
  items: ShellNavItem[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { session, getAccessToken } = useSession();
  const token = getAccessToken();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'all' | 'nav' | 'entities'>('all');
  const [entityHits, setEntityHits] = useState<EntityHit[]>([]);
  const [entityLoading, setEntityLoading] = useState(false);
  const [recent, setRecent] = useState<EntityHit[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const navMatches = useMemo(() => filterNavItems(items, query).slice(0, 8), [items, query]);

  useEffect(() => {
    if (open) {
      setRecent(readRecent());
    } else {
      setQuery('');
      setEntityHits([]);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !token || query.trim().length < 2 || mode === 'nav') {
      setEntityHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        setEntityLoading(true);
        try {
          const country = marketCountryPickerValue(session.countryCode);
          const params = new URLSearchParams({ q: query.trim() });
          if (country) {
            params.set('country_code', country);
          }
          const res = await adminJson<{ data?: EntityHit[] }>(
            token,
            `/api/v1/admin/search/entities?${params.toString()}`,
          );
          setEntityHits(res.data ?? []);
        } catch {
          setEntityHits([]);
        } finally {
          setEntityLoading(false);
        }
      })();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [mode, open, query, session.countryCode, token]);

  const combined = useMemo(() => {
    const rows: Array<{ kind: 'nav' | 'entity' | 'recent'; label: string; href: string; meta?: string; hit?: EntityHit }> = [];
    if (!query.trim() && recent.length) {
      for (const hit of recent) {
        rows.push({ kind: 'recent', label: hit.label, href: hit.href, meta: `${hit.entity_type} · recent`, hit });
      }
    }
    if (mode !== 'entities') {
      for (const item of navMatches) {
        rows.push({ kind: 'nav', label: item.label, href: item.href.startsWith('/#') ? '/' : item.href, meta: 'module' });
      }
    }
    if (mode !== 'nav') {
      for (const hit of entityHits) {
        rows.push({
          kind: 'entity',
          label: hit.label,
          href: hit.href,
          meta: [hit.entity_type, hit.status, hit.country_code].filter(Boolean).join(' · '),
          hit,
        });
      }
    }
    return rows.slice(0, 14);
  }, [entityHits, mode, navMatches, query, recent]);

  useEffect(() => {
    setActiveIndex(0);
  }, [combined.length, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(combined.length - 1, 0)));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
      if (event.key === 'Enter' && combined[activeIndex]) {
        event.preventDefault();
        const row = combined[activeIndex];
        if (row.hit) {
          pushRecent(row.hit);
        }
        router.push(row.href);
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, combined, onClose, open, router]);

  if (!open) {
    return null;
  }

  return (
    <div className="wp-admin-palette-backdrop" role="presentation" onClick={onClose}>
      <div
        className="wp-admin-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Admin command palette"
        onClick={(event) => event.stopPropagation()}
      >
        <Input
          autoFocus
          aria-label="Search modules and entities"
          placeholder="Jump to module or search orders, products, labs…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="wp-toolbar">
          <Button size="sm" variant={mode === 'all' ? 'primary' : 'secondary'} onClick={() => setMode('all')}>
            All
          </Button>
          <Button size="sm" variant={mode === 'nav' ? 'primary' : 'secondary'} onClick={() => setMode('nav')}>
            Modules
          </Button>
          <Button size="sm" variant={mode === 'entities' ? 'primary' : 'secondary'} onClick={() => setMode('entities')}>
            Entities
          </Button>
        </div>
        {entityLoading ? <LoadingState label="Searching entities" /> : null}
        <ul className="wp-admin-palette-list">
          {combined.map((row, index) => (
            <li key={`${row.kind}-${row.href}-${row.label}`}>
              <button
                type="button"
                className={`wp-admin-palette-item${index === activeIndex ? ' is-active' : ''}`}
                onClick={() => {
                  if (row.hit) {
                    pushRecent(row.hit);
                  }
                  router.push(row.href);
                  onClose();
                }}
              >
                <span>{row.label}</span>
                <code>{row.meta ?? row.href}</code>
              </button>
            </li>
          ))}
        </ul>
        {combined.length === 0 && !entityLoading ? (
          <p className="wp-text-muted">No matches. Try another query or switch mode.</p>
        ) : null}
        <div className="wp-toolbar">
          <Button size="sm" variant="tertiary" onClick={onClose}>
            Close (Esc)
          </Button>
          <Text size="caption" tone="secondary">
            ↑↓ navigate · Enter open
          </Text>
          <Link href="/approvals">Approval center</Link>
        </div>
      </div>
    </div>
  );
}

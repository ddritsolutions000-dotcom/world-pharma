'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  DISCOVERY_TYPE_LABELS,
  fetchDiscoverySuggest,
  type DiscoveryResultItem,
  type DiscoveryType,
} from './discovery-api';
import { SEARCH_SCOPES, searchResultsHref, type SearchScopeId } from './search-scope';

function suggestLabel(type: DiscoveryType): string {
  return DISCOVERY_TYPE_LABELS[type] ?? type;
}

export function StoreSearchBox({
  country,
  initialQuery = '',
  initialScope = 'all',
  locale = 'en',
  className = 'mg-search-form',
}: {
  country: string;
  initialQuery?: string;
  initialScope?: SearchScopeId;
  locale?: string;
  className?: string;
}) {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [scope, setScope] = useState<SearchScopeId>(initialScope);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<DiscoveryResultItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    setScope(initialScope);
  }, [initialScope]);

  const goSearch = useCallback(
    (term: string) => {
      const trimmed = term.trim();
      setOpen(false);
      if (trimmed) {
        router.push(searchResultsHref(trimmed, scope));
      } else {
        router.push('/');
      }
    },
    [router, scope],
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || !country.trim()) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void fetchDiscoverySuggest({
        country,
        locale,
        q: trimmed,
        limit: 8,
        types: SEARCH_SCOPES.find((s) => s.id === scope)?.types ?? ['commerce', 'help', 'doctor', 'test'],
      })
        .then((result) => {
          if (!cancelled) {
            setSuggestions(result.data);
            setOpen(result.data.length > 0);
            setActiveIndex(-1);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([]);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [country, locale, query, scope]);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        goSearch(query);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = activeIndex >= 0 ? suggestions[activeIndex] : null;
      if (pick?.href) {
        setOpen(false);
        router.push(pick.href);
      } else {
        goSearch(query);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const activeScope = SEARCH_SCOPES.find((s) => s.id === scope) ?? SEARCH_SCOPES[0];

  return (
    <div ref={rootRef} className={`${className} mg-search-box`}>
      <div className="mg-search-scopes" role="tablist" aria-label="Search in">
        {SEARCH_SCOPES.map((row) => (
          <button
            key={row.id}
            type="button"
            role="tab"
            className={scope === row.id ? 'mg-search-scope is-active' : 'mg-search-scope'}
            onClick={() => setScope(row.id)}
          >
            {row.label}
          </button>
        ))}
      </div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          goSearch(query);
        }}
      >
        <svg className="mg-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          name="q"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="mg-search-input"
          placeholder={activeScope.placeholder}
          aria-label={activeScope.placeholder}
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-expanded={open}
        />
      </form>

      {open && (suggestions.length > 0 || loading) ? (
        <ul id={listId} className="mg-search-suggest" role="listbox">
          {loading && suggestions.length === 0 ? (
            <li className="mg-search-suggest-status">Searching…</li>
          ) : null}
          {suggestions.map((item, index) => (
            <li key={`${item.type}-${item.id}`} role="option" aria-selected={index === activeIndex}>
              {item.href ? (
                <Link
                  href={item.href}
                  className={index === activeIndex ? 'mg-search-suggest-item is-active' : 'mg-search-suggest-item'}
                  onClick={() => setOpen(false)}
                >
                  <span className="mg-search-suggest-type">{suggestLabel(item.type)}</span>
                  <span className="mg-search-suggest-title">{item.title}</span>
                  {item.subtitle ? <span className="mg-search-suggest-sub">{item.subtitle}</span> : null}
                </Link>
              ) : (
                <button
                  type="button"
                  className={index === activeIndex ? 'mg-search-suggest-item is-active' : 'mg-search-suggest-item'}
                  onClick={() => goSearch(item.title)}
                >
                  <span className="mg-search-suggest-type">{suggestLabel(item.type)}</span>
                  <span className="mg-search-suggest-title">{item.title}</span>
                </button>
              )}
            </li>
          ))}
          <li className="mg-search-suggest-footer">
            <button type="button" className="mg-search-suggest-all" onClick={() => goSearch(query)}>
              Search for &ldquo;{query.trim()}&rdquo;
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

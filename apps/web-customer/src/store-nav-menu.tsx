'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCategories } from './store-api';
import {
  isMegaSectionActive,
  MEGA_MENU_SECTIONS,
  type MegaMenuSection,
  type MegaMenuLink,
} from './store-mega-menu-config';

function canHoverFinePointer() {
  return typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function StoreNavMenu({
  country,
  sections,
}: {
  country: string;
  sections?: MegaMenuSection[];
}) {
  const pathname = usePathname() ?? '/';
  const menuSections = sections?.length ? sections : MEGA_MENU_SECTIONS;
  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const openSectionNow = useCallback(
    (id: string) => {
      clearCloseTimer();
      setOpenSection(id);
    },
    [clearCloseTimer],
  );

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpenSection(null), 80);
  }, [clearCloseTimer]);

  useEffect(() => {
    if (!country.trim()) {
      setCategories([]);
      return;
    }
    void fetchCategories(country)
      .then((rows) => setCategories(rows.slice(0, 10)))
      .catch(() => setCategories([]));
  }, [country]);

  useEffect(() => {
    setMobileOpen(false);
    setOpenSection(null);
  }, [pathname]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!navRef.current?.contains(event.target as Node)) {
        setOpenSection(null);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenSection(null);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  function renderMegaPanel(section: MegaMenuSection) {
    const categoryColumn: { title: string; links: MegaMenuLink[] } | null =
      section.id === 'shop' && categories.length
        ? {
            title: 'Categories',
            links: [
              { href: '/categories', label: 'Browse all categories', icon: '🗂️' },
              ...categories.map((c): MegaMenuLink => ({ href: `/c/${c.slug}`, label: c.name, icon: '▸' })),
            ],
          }
        : null;
    const columns = categoryColumn ? [...(section.columns ?? []), categoryColumn] : (section.columns ?? []);
    const hasBody = Boolean(section.featured?.length || columns.length);
    if (!hasBody) return null;

    return (
      <div
        className="mg-mega-panel"
        role="region"
        aria-label={`${section.label} menu`}
        onMouseEnter={clearCloseTimer}
      >
        <div className="mg-mega-panel-inner">
          {section.featured?.length ? (
            <ul className="mg-mega-featured">
              {section.featured.map((tile) => (
                <li key={tile.href}>
                  <Link href={tile.href} className="mg-mega-tile" onClick={() => setOpenSection(null)}>
                    <span className="mg-mega-tile-icon" aria-hidden>
                      {tile.icon}
                    </span>
                    <span className="mg-mega-tile-copy">
                      <strong>{tile.label}</strong>
                      <span>{tile.description}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {columns.length ? (
            <div className="mg-mega-columns">
              {columns.map((col) => (
                <div key={col.title} className="mg-mega-column">
                  <p className="mg-mega-column-title">{col.title}</p>
                  <ul className="mg-mega-links">
                    {col.links.map((link) => (
                      <li key={link.href + link.label}>
                        <Link
                          href={link.href}
                          className={`mg-mega-link${link.match?.(pathname) ? ' is-active' : ''}`}
                          onClick={() => setOpenSection(null)}
                        >
                          {link.icon ? (
                            <span className="mg-mega-link-icon" aria-hidden>
                              {link.icon}
                            </span>
                          ) : null}
                          <span className="mg-mega-link-copy">
                            <span>{link.label}</span>
                            {link.description ? <span className="mg-mega-link-desc">{link.description}</span> : null}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="mg-subnav-toolbar"
      ref={navRef}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="mg-mobile-menu-btn"
        aria-expanded={mobileOpen}
        aria-controls="mg-mobile-nav"
        onClick={() => setMobileOpen((v) => !v)}
      >
        Menu
      </button>

      <nav className="mg-subnav mg-mega-nav" aria-label="Primary">
        {menuSections.map((section) => {
          const active = isMegaSectionActive(section, pathname);
          const isOpen = openSection === section.id;

          if (section.href) {
            return (
              <Link
                key={section.id}
                href={section.href}
                className={`mg-subnav-link${active ? ' is-active' : ''}`}
              >
                {section.label}
              </Link>
            );
          }

          return (
            <div
              key={section.id}
              className={`mg-mega-wrap${isOpen ? ' is-open' : ''}`}
              onMouseEnter={() => openSectionNow(section.id)}
            >
              <button
                type="button"
                className={`mg-subnav-link mg-mega-trigger${active ? ' is-active' : ''}`}
                aria-expanded={isOpen}
                aria-haspopup="true"
                onClick={() => {
                  if (canHoverFinePointer()) {
                    openSectionNow(section.id);
                    return;
                  }
                  setOpenSection((current) => (current === section.id ? null : section.id));
                }}
              >
                {section.label} <span aria-hidden>▾</span>
              </button>
              {isOpen ? renderMegaPanel(section) : null}
            </div>
          );
        })}

        <Link href="/account" className={`mg-subnav-link${pathname.startsWith('/account') ? ' is-active' : ''}`}>
          Account
        </Link>
        <Link href="/cart" className="mg-subnav-link mg-subnav-link--cart">
          Cart
        </Link>
      </nav>

      {mobileOpen ? (
        <nav id="mg-mobile-nav" className="mg-mobile-nav" aria-label="Mobile menu">
          {menuSections.map((section) => (
            <div key={section.id} className="mg-mobile-nav-group">
              <p className="mg-mobile-nav-heading">{section.label}</p>
              {section.href ? (
                <Link href={section.href} className="mg-mobile-nav-link">
                  {section.label}
                </Link>
              ) : (
                <>
                  {section.columns?.flatMap((col) =>
                    col.links.map((link) => (
                      <Link key={link.href + link.label} href={link.href} className="mg-mobile-nav-link">
                        {link.label}
                      </Link>
                    )),
                  )}
                  {section.id === 'shop' ? (
                    <>
                      <Link href="/categories" className="mg-mobile-nav-link">
                        All categories
                      </Link>
                      {categories.map((c) => (
                        <Link key={c.slug} href={`/c/${c.slug}`} className="mg-mobile-nav-link mg-mobile-nav-link--indent">
                          {c.name}
                        </Link>
                      ))}
                    </>
                  ) : null}
                </>
              )}
            </div>
          ))}
          <hr className="mg-mobile-nav-divider" />
          <Link href="/account" className="mg-mobile-nav-link">
            Account
          </Link>
          <Link href="/cart" className="mg-mobile-nav-link">
            Cart
          </Link>
        </nav>
      ) : null}
    </div>
  );
}

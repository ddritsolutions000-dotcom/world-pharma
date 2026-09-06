'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  DEFAULT_SITE_FOOTER,
  footerServicePreviewLinks,
  isServicesFooterColumn,
  type SiteFooterDocument,
} from '@world-pharma/shared/site-chrome';
import { fetchCategories } from '../store-api';

export function TrustStrip({ items }: { items?: SiteFooterDocument['trust'] }) {
  const badges = items?.length ? items : DEFAULT_SITE_FOOTER.trust;
  return (
    <section className="mg-trust-strip" aria-label="Trust badges">
      <div className="mg-trust-strip-inner">
        {badges.map((badge) => (
          <div key={badge.label} className="mg-trust-badge">
            <span className="mg-trust-badge-icon" aria-hidden>
              {badge.icon}
            </span>
            <span>{badge.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function SiteFooter({ country, footer }: { country: string; footer?: SiteFooterDocument }) {
  const doc = footer ?? DEFAULT_SITE_FOOTER;
  const [categoryLinks, setCategoryLinks] = useState<{ href: string; label: string }[]>([]);

  useEffect(() => {
    if (!country.trim()) {
      setCategoryLinks([]);
      return;
    }
    void fetchCategories(country)
      .then((rows) =>
        setCategoryLinks(
          rows.slice(0, 8).map((c) => ({
            href: `/c/${c.slug}`,
            label: c.name,
          })),
        ),
      )
      .catch(() => setCategoryLinks([]));
  }, [country]);

  const columns = doc.columns.map((col) => {
    if (col.source === 'categories') {
      return {
        title: col.title,
        links:
          categoryLinks.length > 0
            ? [...categoryLinks, { href: '/categories', label: 'View all categories →' }]
            : col.links,
      };
    }
    if (isServicesFooterColumn(col)) {
      return { title: col.title, links: footerServicePreviewLinks(col) };
    }
    return col;
  });

  return (
    <footer className="mg-footer">
      <div className="mg-footer-top">
        <div className="mg-footer-inner">
          <div className="mg-footer-brand-col">
            <Link href="/" className="mg-footer-brand">
              <span className="wp-logo-mark" aria-hidden>
                <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="14" fill="#1A365D" />
                  <ellipse cx="16" cy="16" rx="14" ry="6" stroke="#7DDBB0" strokeWidth="1.4" />
                  <path d="M2 16h28M16 2c4 4.5 6 9 6 14s-2 9.5-6 14c-4-4.5-6-9-6-14s2-9.5 6-14z" stroke="#fff" strokeWidth="1.3" />
                  <circle cx="16" cy="16" r="3.2" fill="#0D9488" />
                </svg>
              </span>
              <span>
                World-Pharma<span className="mg-logo-accent">™</span>
              </span>
            </Link>
            <p className="mg-footer-tagline">{doc.tagline}</p>
            <div className="mg-footer-app">
              <p className="mg-footer-app-title">{doc.appTitle}</p>
              <div className="mg-footer-app-badges">
                {doc.appLinks.map((link) => (
                  <Link key={link.href + link.label} href={link.href} className="mg-app-badge">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
            <p className="mg-footer-partner-link">
              <Link href={doc.partnerHref}>{doc.partnerLabel}</Link>
            </p>
          </div>

          <div className="mg-footer-columns">
            {columns.map((col) => (
              <div key={col.title} className="mg-footer-col">
                <h3 className="mg-footer-col-title">{col.title}</h3>
                <ul className="mg-footer-col-links">
                  {col.links.map((link) => (
                    <li key={link.href + link.label}>
                      <Link href={link.href}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mg-footer-payments">
        <div className="mg-footer-inner mg-footer-payments-inner">
          <span className="mg-footer-payments-label">We accept</span>
          <div className="mg-payment-icons">
            {doc.payments.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="mg-footer-bottom">
        <div className="mg-footer-inner mg-footer-bottom-inner">
          <p>
            © {new Date().getFullYear()} {doc.copyright}
          </p>
          <p className="mg-footer-disclaimer">{doc.disclaimer}</p>
        </div>
      </div>
    </footer>
  );
}

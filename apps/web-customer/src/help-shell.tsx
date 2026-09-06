'use client';

import Link from 'next/link';
import { useSelectedCountry } from './use-selected-country';
import { MgBackLink, Page } from './ui/mg-ui';

export function HelpShell({
  title,
  subtitle,
  children,
  backHref = '/help',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  backHref?: string;
}) {
  const { country } = useSelectedCountry();
  const locale = 'en';

  return (
    <Page>
      <MgBackLink href={backHref}>← Help Centre</MgBackLink>
      <section className="mg-service-hero mg-service-hero--compact" aria-label="Help">
        <p className="mg-service-kicker">Help Centre</p>
        <h1 className="mg-service-title">{title}</h1>
        <p className="mg-service-sub">
          {subtitle ?? 'Find answers about orders, medicines, lab tests, and your account.'}
        </p>
      </section>
      <nav className="mg-help-nav" aria-label="Help navigation">
        <Link href="/help" className="mg-help-nav-link">
          Home
        </Link>
        <Link href={`/help/search?country=${country}&locale=${locale}`} className="mg-help-nav-link">
          Search FAQs
        </Link>
        <Link href="/account/support" className="mg-help-nav-link">
          Contact Support
        </Link>
        <Link href="/" className="mg-help-nav-link">
          Shop Medicines
        </Link>
      </nav>
      <div className="mg-help-content">{children}</div>
    </Page>
  );
}

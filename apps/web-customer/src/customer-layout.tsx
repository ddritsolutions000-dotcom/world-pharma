'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSession, PathBreadcrumbs, CUSTOMER_ROUTE_LABELS } from '@world-pharma/shell-web';
import { LoadingState } from '@world-pharma/ui-kit/web';
import { SiteFooter, TrustStrip } from './ui/site-footer';
import { CategoryRail } from './ui/category-rail';
import { StoreSearchBox } from './store-search-box';
import { StoreNavMenu } from './store-nav-menu';
import { countryDisplayName, useSelectedCountry } from './use-selected-country';
import { CountryMarketGate } from './country-market-gate';
import { useServiceability } from './use-serviceability';
import { HeaderInboxLink } from './header-inbox-link';
import { HeaderCartLink } from './header-cart-link';
import { GuestCartMerge } from './guest-cart-merge';
import { useSiteChrome } from './use-site-chrome';
import { siteNavToMega } from './store-mega-menu-config';

function BrandMark() {
  return (
    <span className="wp-logo-mark" aria-hidden>
      <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="14" fill="#1A365D" />
        <ellipse cx="16" cy="16" rx="14" ry="6" stroke="#7DDBB0" strokeWidth="1.4" />
        <path d="M2 16h28M16 2c4 4.5 6 9 6 14s-2 9.5-6 14c-4-4.5-6-9-6-14s2-9.5 6-14z" stroke="#fff" strokeWidth="1.3" />
        <circle cx="16" cy="16" r="3.2" fill="#0D9488" />
      </svg>
    </span>
  );
}

function PinSvg() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 21s7-4.5 7-10a7 7 0 10-14 0c0 5.5 7 10 7 10z" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

const AUTH_ROUTES = ['/login', '/signup'] as const;

const COUNTRY_OPTIONAL_PREFIXES = [
  '/help',
  '/legal',
  '/faq',
  '/about',
  '/careers',
  '/blog',
  '/contact',
  '/account',
  '/orders',
  '/track-order',
  '/shipments',
  '/prescriptions',
  '/notifications',
  '/reminders',
  '/consent',
  '/health/artifacts',
] as const;

function countrySelectionOptional(pathname: string): boolean {
  return COUNTRY_OPTIONAL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function HeaderSearch({ country }: { country: string }) {
  const searchParams = useSearchParams();
  return <StoreSearchBox country={country} initialQuery={searchParams.get('q') ?? ''} />;
}

export function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/';
  const { session, signOut } = useSession();
  const { country, countries, setCountry, countryName, needsSelection, hydrated } = useSelectedCountry();
  const { nav, footer } = useSiteChrome(country);
  const menuSections = nav.sections.filter((row) => row.enabled).map(siteNavToMega);
  const { postalCode, setPostalCode, serviceability, loading: serviceabilityLoading } = useServiceability(country);
  const isAuthRoute = AUTH_ROUTES.includes(pathname as (typeof AUTH_ROUTES)[number]);
  const countryOptional = countrySelectionOptional(pathname);
  // Block country-scoped pages until localStorage hydrate completes (avoids empty-country API).
  const showCountryGate = needsSelection && !countryOptional;
  const waitForCountry = !hydrated && !countryOptional;
  // Defer session chrome until after mount so SSR (Login/Sign up) matches first client paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const showAuthedChrome = mounted && session.status === 'authenticated';

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <div className="mg-app">
      <div className="mg-top-strip">
        <span>World-Pharma™ · Global Healthcare. For a Healthier Tomorrow.</span>
        {nav.topStrip.map((link) => (
          <Link key={link.href + link.label} href={link.href}>
            {link.label}
          </Link>
        ))}
      </div>

      <header className="mg-header">
        <div className="mg-header-row">
          <Link href="/" className="mg-logo" aria-label="World Pharma home">
            <BrandMark />
            <span className="mg-logo-text">
              World-Pharma<span className="mg-logo-accent">™</span>
            </span>
          </Link>

          <div className="mg-location">
            <PinSvg />
            <div className="mg-location-inner">
              <span className="mg-location-city" aria-live="polite">
                {serviceabilityLoading
                  ? 'Checking…'
                  : serviceability?.city
                    ? `Delivering to ${serviceability.city}`
                    : serviceability?.serviceable
                      ? 'Delivery available'
                      : 'Enter postal code'}
              </span>
              <div className="mg-location-controls">
                <select
                  id="wp-country-select"
                  className="mg-country-select"
                  value={country || ''}
                  onChange={(e) => setCountry(e.target.value)}
                  aria-label="Delivery country"
                >
                  {!country ? (
                    <option value="" disabled>
                      Select market
                    </option>
                  ) : null}
                  {countries.length === 0 ? <option value={country}>{countryName}</option> : null}
                  {countries.map((c) => (
                    <option key={c.iso_alpha2} value={c.iso_alpha2}>
                      {countryDisplayName(c)} ({c.iso_alpha2})
                    </option>
                  ))}
                </select>
                <input
                  className="mg-postal-input"
                  inputMode="text"
                  maxLength={12}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="Pincode"
                  aria-label="Delivery postal code"
                />
              </div>
            </div>
          </div>

          <Suspense fallback={<div className="mg-search-form mg-search-box" aria-hidden />}>
            <HeaderSearch country={country} />
          </Suspense>

          <div className="mg-header-actions">
            <Link href="/help" className="mg-header-link">
              Need Help
            </Link>
            {showAuthedChrome ? (
              <>
                <HeaderInboxLink />
                <Link href="/account" className="mg-header-link">
                  My account
                </Link>
                <Link href="/orders" className="mg-header-link">
                  Orders
                </Link>
                <button type="button" className="mg-header-link mg-header-btn" onClick={() => signOut()}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="mg-header-link">
                  Login
                </Link>
                <Link href="/signup" className="mg-header-link mg-header-link--accent">
                  Sign up
                </Link>
              </>
            )}
            <HeaderCartLink />
          </div>
        </div>

        <CategoryRail />
        <StoreNavMenu country={country} sections={menuSections} />
      </header>

      <main className="mg-main">
        <div className="mg-main-inner">
          <PathBreadcrumbs
            pathname={pathname}
            options={{ root: { href: '/', label: 'Home' }, labels: CUSTOMER_ROUTE_LABELS }}
            className="mg-crumbs wp-crumbs"
            LinkComponent={Link}
          />
          {waitForCountry ? (
            <LoadingState label="Loading market…" />
          ) : showCountryGate ? (
            <CountryMarketGate countries={countries} onSelect={setCountry} />
          ) : (
            children
          )}
          <GuestCartMerge />
        </div>
      </main>

      <TrustStrip items={footer.trust} />
      <SiteFooter country={country} footer={footer} />
    </div>
  );
}

'use client';

import Link from 'next/link';
import { scopeLabel } from './working-country';

export function AdminChromeFooter({
  apiReady,
  countryScope,
  environment = 'Sandbox',
}: {
  apiReady: 'ready' | 'not_ready' | 'checking';
  countryScope?: string | null;
  environment?: string;
}) {
  const scope = scopeLabel(countryScope);
  return (
    <footer className="wp-admin-foot">
      <p>
        API {apiReady === 'checking' ? '…' : apiReady} · ports 4000 / 3001 · {environment} · {scope} · not live PSP,
        WhatsApp, or Search Console
      </p>
      <nav aria-label="Footer modules">
        <Link href="/marketing">Marketing</Link>
        <Link href="/seo">SEO</Link>
        <Link href="/notifications">Notifications</Link>
        <Link href="/cms">CMS</Link>
        <Link href="/analytics">Analytics</Link>
        <Link href="/health-packages">Packages</Link>
        <Link href="/serviceability">Serviceability</Link>
        <Link href="/corporate">Corporate</Link>
        <Link href="/support">Support</Link>
      </nav>
    </footer>
  );
}

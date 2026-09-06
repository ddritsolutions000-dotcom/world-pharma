'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PortalAuthPage } from '@world-pharma/shell-web';
import { VENDOR_JOIN_ROUTES } from '../../src/vendor-join-routes';

export default function VendorLoginPage() {
  const router = useRouter();
  return (
    <div className="vendor-login-wrap">
      <div className="vendor-login-ambient" aria-hidden />
      <div className="vendor-login-grid">
        <aside className="vendor-login-aside">
          <Link href="/" className="vendor-public-brand vendor-public-brand--footer">
            <span className="vendor-public-brand-mark" aria-hidden>
              W
            </span>
            <span className="vendor-public-brand-text">
              World Pharma <em>Vendor</em>
            </span>
          </Link>
          <h1 className="vendor-login-title">Seller workspace sign-in</h1>
          <p className="vendor-login-lead">
            Use the same email you applied with. After company approval, manage catalog, orders, and settlements from one
            place.
          </p>
          <div className="vendor-login-links">
            <Link href="/">← Back to vendor home</Link>
            <Link href={VENDOR_JOIN_ROUTES.apply}>Join as vendor</Link>
          </div>
        </aside>
        <div className="vendor-login-panel">
          <PortalAuthPage portalId="vendor" onAuthenticated={() => router.replace('/workspace')} />
        </div>
      </div>
    </div>
  );
}

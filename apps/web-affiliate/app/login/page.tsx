'use client';

import { useRouter } from 'next/navigation';
import { PortalAuthPage } from '@world-pharma/shell-web';

/** Alias for portal sign-in — same OTP flow as the affiliate home shell. */
export default function AffiliateLoginPage() {
  const router = useRouter();
  return <PortalAuthPage portalId="affiliate" onAuthenticated={() => router.replace('/')} />;
}

'use client';

import { useRouter } from 'next/navigation';
import { PortalAuthPage } from '@world-pharma/shell-web';

/** Alias for logistics OTP sign-in (auth also available on portal home). */
export default function LogisticsLoginPage() {
  const router = useRouter();
  return <PortalAuthPage portalId="logistics" onAuthenticated={() => router.replace('/')} />;
}

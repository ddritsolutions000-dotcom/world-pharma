'use client';

import { useSearchParams } from 'next/navigation';
import { PortalAuthPage, useSession } from '@world-pharma/shell-web';
import { guestCartQty } from '../../src/guest-cart';
import { mergeGuestCartForCountry } from '../../src/guest-cart-merge';
import { safeInternalPath } from '../../src/safe-internal-path';
import { useSelectedCountry } from '../../src/use-selected-country';

export default function SignupPage() {
  const searchParams = useSearchParams();
  const { getAccessToken } = useSession();
  const { country } = useSelectedCountry();

  return (
    <div className="mg-auth-page">
      <PortalAuthPage
        portalId="customer"
        mode="sign-up"
        onAuthenticated={() => {
          const go = () => {
            const next = safeInternalPath(searchParams.get('next')) ?? (guestCartQty(country) ? '/cart' : '/');
            window.location.href = next;
          };
          // Session is persisted before onAuthenticated; read storage directly to avoid stale React token state.
          const token = getAccessToken() ?? (() => {
            try {
              const raw = window.localStorage.getItem('wp_session_v1');
              if (!raw) return null;
              const parsed = JSON.parse(raw) as { accessToken?: string };
              return parsed.accessToken ?? null;
            } catch {
              return null;
            }
          })();
          if (!token) {
            go();
            return;
          }
          void mergeGuestCartForCountry(token, country).finally(go);
        }}
      />
    </div>
  );
}

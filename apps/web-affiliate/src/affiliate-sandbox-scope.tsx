'use client';

import { Card, EmptyState, Heading, Text } from '@world-pharma/ui-kit/web';

/** XX is the intentional sandbox affiliate market — not a production storefront market. */
export const AFFILIATE_SANDBOX_COUNTRY_CODE = 'XX';

export function isAffiliateSandboxCountry(countryCode: string): boolean {
  return countryCode.trim().toUpperCase() === AFFILIATE_SANDBOX_COUNTRY_CODE;
}

export function AffiliateSandboxScopeNotice({
  requestedCountry,
}: {
  requestedCountry: string;
}) {
  const code = requestedCountry.trim().toUpperCase() || 'XX';
  if (isAffiliateSandboxCountry(code)) {
    return (
      <Card>
        <Heading level={2}>Sandbox affiliate market (XX)</Heading>
        <Text tone="secondary">
          Demo affiliate partners are scoped to sandbox country <strong>XX</strong>. Storefront markets IN / AE / US
          do not share this partner membership. Authorization is unchanged — use XX for sandbox affiliate APIs.
        </Text>
      </Card>
    );
  }
  return (
    <EmptyState
      title="Affiliate market out of scope"
      description={`Your affiliate organization is sandbox-scoped (XX). Country ${code} is a customer store market and is not authorized for this partner. Switch the country code back to XX — do not treat this as a missing permission on IN/AE/US.`}
    />
  );
}

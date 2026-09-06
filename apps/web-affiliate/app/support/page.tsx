import { AffiliateSupportPage } from '../../src/affiliate-hub';
import { AffiliateShell } from '../../src/affiliate-shell';

export default function AffiliateSupportRoute() {
  return (
    <AffiliateShell currentNav="support">
      <AffiliateSupportPage />
    </AffiliateShell>
  );
}

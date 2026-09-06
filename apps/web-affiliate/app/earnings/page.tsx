import { AffiliateEarningsPage } from '../../src/affiliate-hub';
import { AffiliateShell } from '../../src/affiliate-shell';

export default function AffiliateEarningsRoute() {
  return (
    <AffiliateShell currentNav="earnings">
      <AffiliateEarningsPage />
    </AffiliateShell>
  );
}

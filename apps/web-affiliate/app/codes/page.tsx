import { AffiliateCodesPage } from '../../src/affiliate-hub';
import { AffiliateShell } from '../../src/affiliate-shell';

export default function AffiliateCodesRoute() {
  return (
    <AffiliateShell currentNav="codes">
      <AffiliateCodesPage />
    </AffiliateShell>
  );
}

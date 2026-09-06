import { AffiliateLinksPage } from '../../src/affiliate-hub';
import { AffiliateShell } from '../../src/affiliate-shell';

export default function AffiliateLinksRoute() {
  return (
    <AffiliateShell currentNav="links">
      <AffiliateLinksPage />
    </AffiliateShell>
  );
}

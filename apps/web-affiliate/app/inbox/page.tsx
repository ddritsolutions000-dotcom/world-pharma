import { AffiliateInboxPage } from '../../src/affiliate-hub';
import { AffiliateShell } from '../../src/affiliate-shell';

export default function AffiliateInboxRoute() {
  return (
    <AffiliateShell currentNav="inbox">
      <AffiliateInboxPage />
    </AffiliateShell>
  );
}

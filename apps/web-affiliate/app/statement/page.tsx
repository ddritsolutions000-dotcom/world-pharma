import { AffiliateStatementPage } from '../../src/affiliate-hub';
import { AffiliateShell } from '../../src/affiliate-shell';

export default function AffiliateStatementRoute() {
  return (
    <AffiliateShell currentNav="statement">
      <AffiliateStatementPage />
    </AffiliateShell>
  );
}

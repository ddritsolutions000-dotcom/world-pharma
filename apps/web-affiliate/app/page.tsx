import { AffiliateDashboard } from '../src/affiliate-hub';
import { AffiliateShell } from '../src/affiliate-shell';

export default function HomePage() {
  return (
    <AffiliateShell currentNav="dashboard">
      <AffiliateDashboard />
    </AffiliateShell>
  );
}

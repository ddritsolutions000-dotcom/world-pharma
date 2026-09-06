import { AffiliateProfilePage } from '../../src/affiliate-hub';
import { AffiliateShell } from '../../src/affiliate-shell';

export default function AffiliateProfileRoute() {
  return (
    <AffiliateShell currentNav="profile">
      <AffiliateProfilePage />
    </AffiliateShell>
  );
}

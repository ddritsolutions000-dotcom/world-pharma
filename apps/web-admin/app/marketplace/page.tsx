import { AdminShell } from '../../src/admin-shell';
import { MarketplaceAdminPanel } from '../../src/marketplace-admin';

export default function MarketplacePage() {
  return (
    <AdminShell>
      <MarketplaceAdminPanel />
    </AdminShell>
  );
}

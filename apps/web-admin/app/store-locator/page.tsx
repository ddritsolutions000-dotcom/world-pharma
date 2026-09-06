import { AdminShell } from '../../src/admin-shell';
import { StoreLocatorAdminPanel } from '../../src/store-locator-admin';

export default function StoreLocatorPage() {
  return (
    <AdminShell currentNav="store-locator">
      <StoreLocatorAdminPanel />
    </AdminShell>
  );
}

import { AdminShell } from '../../src/admin-shell';
import { RefillsAdminPanel } from '../../src/refills-admin';

export default function RefillsPage() {
  return (
    <AdminShell>
      <RefillsAdminPanel />
    </AdminShell>
  );
}

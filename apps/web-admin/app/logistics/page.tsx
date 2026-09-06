import { AdminShell } from '../../src/admin-shell';
import { LogisticsAdminPanel } from '../../src/logistics-admin';

export default function LogisticsPage() {
  return (
    <AdminShell currentNav="logistics">
      <LogisticsAdminPanel />
    </AdminShell>
  );
}

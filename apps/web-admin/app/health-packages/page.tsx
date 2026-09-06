import { AdminShell } from '../../src/admin-shell';
import { HealthPackagesAdminPanel } from '../../src/health-packages-admin';

export default function HealthPackagesPage() {
  return (
    <AdminShell currentNav="health-packages">
      <HealthPackagesAdminPanel />
    </AdminShell>
  );
}

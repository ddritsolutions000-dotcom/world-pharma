import { AdminShell } from '../../src/admin-shell';
import { ServiceabilityAdminPanel } from '../../src/serviceability-admin';

export default function ServiceabilityPage() {
  return (
    <AdminShell currentNav="serviceability">
      <ServiceabilityAdminPanel />
    </AdminShell>
  );
}

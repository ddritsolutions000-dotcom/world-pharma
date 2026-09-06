import { AdminShell } from '../../src/admin-shell';
import { HealthcareNetworkAdminPanel } from '../../src/healthcare-network-admin';

export default function HealthcareNetworkPage() {
  return (
    <AdminShell currentNav="healthcare-network">
      <HealthcareNetworkAdminPanel />
    </AdminShell>
  );
}

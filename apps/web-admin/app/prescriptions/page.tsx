import { AdminShell } from '../../src/admin-shell';
import { PrescriptionsAdminPanel } from '../../src/prescriptions-admin';

export default function PrescriptionsPage() {
  return (
    <AdminShell currentNav="prescriptions">
      <PrescriptionsAdminPanel />
    </AdminShell>
  );
}

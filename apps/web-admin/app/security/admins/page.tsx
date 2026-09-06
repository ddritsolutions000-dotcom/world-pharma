import { AdminShell } from '../../../src/admin-shell';
import { AdminStaffPanel } from '../../../src/admin-staff-panel';

export default function AdminSecurityStaffPage() {
  return (
    <AdminShell currentNav="security">
      <AdminStaffPanel />
    </AdminShell>
  );
}

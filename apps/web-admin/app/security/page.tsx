import { AdminShell } from '../../src/admin-shell';
import { AdminSecurityPanel } from '../../src/admin-security-panel';

export default function AdminSecurityPage() {
  return (
    <AdminShell currentNav="security">
      <AdminSecurityPanel />
    </AdminShell>
  );
}

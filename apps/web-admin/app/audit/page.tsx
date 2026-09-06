import { AdminShell } from '../../src/admin-shell';
import { AuditAdminPanel } from '../../src/audit-admin-panel';

export default function AuditGovernancePage() {
  return (
    <AdminShell currentNav="audit">
      <AuditAdminPanel />
    </AdminShell>
  );
}

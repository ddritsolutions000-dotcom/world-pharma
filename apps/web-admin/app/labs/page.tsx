import { AdminShell } from '../../src/admin-shell';
import { LabsAdminPanel } from '../../src/labs-admin';
import { LabOpsAdminPanel } from '../../src/lab-ops-admin';

export default function LabsPage() {
  return (
    <AdminShell currentNav="labs">
      <LabsAdminPanel />
      <LabOpsAdminPanel />
    </AdminShell>
  );
}

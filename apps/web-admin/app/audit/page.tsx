import { AdminShell } from '../../src/admin-shell';
import { SecurityEventsGovernance } from '../../src/governance-admin';

export default function AuditGovernancePage() {
  return (
    <AdminShell>
      <SecurityEventsGovernance />
    </AdminShell>
  );
}

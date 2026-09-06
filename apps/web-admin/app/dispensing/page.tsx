import { AdminShell } from '../../src/admin-shell';
import { DispensingAdminPanel } from '../../src/dispensing-admin';

export default function DispensingPage() {
  return (
    <AdminShell>
      <DispensingAdminPanel />
    </AdminShell>
  );
}

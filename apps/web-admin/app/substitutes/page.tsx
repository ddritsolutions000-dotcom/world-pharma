import { AdminShell } from '../../src/admin-shell';
import { SubstitutesAdminPanel } from '../../src/substitutes-admin';

export default function SubstitutesPage() {
  return (
    <AdminShell currentNav="substitutes">
      <SubstitutesAdminPanel />
    </AdminShell>
  );
}

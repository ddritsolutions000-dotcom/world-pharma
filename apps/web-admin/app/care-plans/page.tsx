import { AdminShell } from '../../src/admin-shell';
import { CarePlanAdminPanel } from '../../src/care-plan-admin';

export default function CarePlansPage() {
  return (
    <AdminShell>
      <CarePlanAdminPanel />
    </AdminShell>
  );
}

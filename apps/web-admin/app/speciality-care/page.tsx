import { AdminShell } from '../../src/admin-shell';
import { SpecialityCareAdminPanel } from '../../src/speciality-care-admin';

export default function SpecialityCarePage() {
  return (
    <AdminShell currentNav="speciality-care">
      <SpecialityCareAdminPanel />
    </AdminShell>
  );
}

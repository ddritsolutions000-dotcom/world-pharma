import { AdminShell } from '../../src/admin-shell';
import { AppointmentsAdminPanel } from '../../src/appointments-admin';

export default function AppointmentsPage() {
  return (
    <AdminShell currentNav="appointments">
      <AppointmentsAdminPanel />
    </AdminShell>
  );
}

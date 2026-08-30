import { AdminShell } from '../../src/admin-shell';
import { AppointmentsAdminPanel } from '../../src/appointments-admin';

export default function AdminAppointmentsPage() {
  return (
    <>
      <AdminShell />
      <AppointmentsAdminPanel />
    </>
  );
}

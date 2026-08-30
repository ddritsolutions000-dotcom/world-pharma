import { AdminShell } from '../../src/admin-shell';
import { DoctorsAdminPanel } from '../../src/doctors-admin';

export default function DoctorsPage() {
  return (
    <>
      <AdminShell />
      <DoctorsAdminPanel />
    </>
  );
}

import { AdminShell } from '../../src/admin-shell';
import { PrescriptionsAdminPanel } from '../../src/prescriptions-admin';

export default function AdminPrescriptionsPage() {
  return (
    <>
      <AdminShell />
      <PrescriptionsAdminPanel />
    </>
  );
}

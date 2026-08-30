import { AdminShell } from '../../src/admin-shell';
import { PaymentsAdminPanel } from '../../src/payments-admin';

export default function PaymentsPage() {
  return (
    <>
      <AdminShell />
      <PaymentsAdminPanel />
    </>
  );
}

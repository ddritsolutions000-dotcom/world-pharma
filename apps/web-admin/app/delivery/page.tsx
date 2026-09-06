import { AdminShell } from '../../src/admin-shell';
import { DeliveryAdminPanel } from '../../src/delivery-admin';

export default function DeliveryPage() {
  return (
    <AdminShell>
      <DeliveryAdminPanel />
    </AdminShell>
  );
}

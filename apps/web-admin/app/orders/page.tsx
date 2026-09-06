import { AdminShell } from '../../src/admin-shell';
import { OrdersAdminPanel } from '../../src/orders-admin';

export default function OrdersPage() {
  return (
    <AdminShell currentNav="orders">
      <OrdersAdminPanel />
    </AdminShell>
  );
}

import { AdminShell } from '../../src/admin-shell';
import { InventoryAdminPanel } from '../../src/inventory-admin';

export default function InventoryPage() {
  return (
    <>
      <AdminShell />
      <InventoryAdminPanel />
    </>
  );
}

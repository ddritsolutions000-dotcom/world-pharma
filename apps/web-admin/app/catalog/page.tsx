import { AdminShell } from '../../src/admin-shell';
import { CatalogAdminPanel } from '../../src/catalog-admin';

export default function CatalogPage() {
  return (
    <AdminShell currentNav="catalog">
      <CatalogAdminPanel />
    </AdminShell>
  );
}

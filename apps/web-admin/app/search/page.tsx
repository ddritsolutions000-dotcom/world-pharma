import { AdminShell } from '../../src/admin-shell';
import { SearchAdminPanel } from '../../src/search-admin';

export default function SearchPage() {
  return (
    <AdminShell>
      <SearchAdminPanel />
    </AdminShell>
  );
}

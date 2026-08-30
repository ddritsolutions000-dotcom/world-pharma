import { AdminShell } from '../../src/admin-shell';
import { PartnersAdmin } from '../../src/partners-admin';

export default function Page() {
  return (
    <AdminShell>
      <PartnersAdmin />
    </AdminShell>
  );
}

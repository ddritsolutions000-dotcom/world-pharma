import { AdminShell } from '../../src/admin-shell';
import { SeoAdminPanel } from '../../src/seo-admin';

export default function SeoPage() {
  return (
    <AdminShell>
      <SeoAdminPanel />
    </AdminShell>
  );
}

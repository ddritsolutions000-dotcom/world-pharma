import { AdminShell } from '../../src/admin-shell';
import { CompanyAuthorityAdminPanel } from '../../src/company-authority-admin';

export default function CompanyAuthorityPage() {
  return (
    <AdminShell>
      <CompanyAuthorityAdminPanel />
    </AdminShell>
  );
}

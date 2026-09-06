import { AdminShell } from '../../src/admin-shell';
import { CorporateWellnessAdminPanel } from '../../src/corporate-wellness-admin';

export default function CorporatePage() {
  return (
    <AdminShell currentNav="corporate">
      <CorporateWellnessAdminPanel />
    </AdminShell>
  );
}

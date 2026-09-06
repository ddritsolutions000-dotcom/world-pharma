import { AdminShell } from '../../src/admin-shell';
import { PolicyPackOperatorPanel } from '../../src/policy-pack-admin';

export default function PolicyPacksPage() {
  return (
    <AdminShell>
      <PolicyPackOperatorPanel />
    </AdminShell>
  );
}

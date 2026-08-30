import { AdminShell } from '../../src/admin-shell';
import { MembershipsGovernance } from '../../src/governance-admin';

export default function IdentityGovernancePage() {
  return (
    <AdminShell>
      <MembershipsGovernance />
    </AdminShell>
  );
}

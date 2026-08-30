import { AdminShell } from '../../../../src/admin-shell';
import { HealthAccessAuditsGovernance } from '../../../../src/health-governance-admin';

export default function HealthAccessAuditsPage() {
  return (
    <AdminShell>
      <HealthAccessAuditsGovernance />
    </AdminShell>
  );
}

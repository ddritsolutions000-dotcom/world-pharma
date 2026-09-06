import { AdminShell } from '../../src/admin-shell';
import { ApprovalCenterAdmin } from '../../src/approval-center-admin';

export default function ApprovalsPage() {
  return (
    <AdminShell currentNav="approvals">
      <ApprovalCenterAdmin />
    </AdminShell>
  );
}

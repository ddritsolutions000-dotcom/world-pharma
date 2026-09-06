import { AdminShell } from '../../../src/admin-shell';
import { CrmAutomationDesk } from '../../../src/crm-automation-desk';

export default function CrmAutomationPage() {
  return (
    <AdminShell currentNav="crm-automation">
      <CrmAutomationDesk />
    </AdminShell>
  );
}

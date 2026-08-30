import { AdminShell } from '../../src/admin-shell';
import { SupportDeskList } from '../../src/support-desk-list';

export default function SupportPage() {
  return (
    <AdminShell>
      <SupportDeskList />
    </AdminShell>
  );
}

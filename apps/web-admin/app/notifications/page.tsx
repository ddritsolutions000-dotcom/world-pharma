import { AdminShell } from '../../src/admin-shell';
import { NotificationsAdminPanel } from '../../src/notifications-admin';

export default function NotificationsPage() {
  return (
    <AdminShell>
      <NotificationsAdminPanel />
    </AdminShell>
  );
}

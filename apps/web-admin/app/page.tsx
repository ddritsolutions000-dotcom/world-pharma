import { AdminShell } from '../src/admin-shell';
import { HomeDashboard } from '../src/home-dashboard';

export default function Page() {
  return (
    <AdminShell currentNav="home">
      <HomeDashboard />
    </AdminShell>
  );
}

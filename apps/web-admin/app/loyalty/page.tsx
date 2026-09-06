import { AdminShell } from '../../src/admin-shell';
import { LoyaltyAdminHub } from '../../src/loyalty-admin';

export default function LoyaltyPage() {
  return (
    <AdminShell currentNav="loyalty">
      <LoyaltyAdminHub />
    </AdminShell>
  );
}

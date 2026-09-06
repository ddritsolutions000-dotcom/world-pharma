import { AdminShell } from '../../src/admin-shell';
import { StorefrontDesk } from '../../src/storefront-desk';

export default function StorefrontPage() {
  return (
    <AdminShell currentNav="storefront">
      <StorefrontDesk />
    </AdminShell>
  );
}

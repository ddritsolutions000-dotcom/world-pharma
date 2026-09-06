import { AdminShell } from '../../../src/admin-shell';
import { SiteChromeAdmin } from '../../../src/site-chrome-admin';

export default function StorefrontChromePage() {
  return (
    <AdminShell currentNav="storefront">
      <SiteChromeAdmin />
    </AdminShell>
  );
}

import { AdminShell } from '../../../src/admin-shell';
import { VendorSupersededNotice } from '../../../src/vendor-superseded-notice';

/** Superseded by apps/web-vendor — kept for admin nav compatibility. */
export default function VendorOrdersPage() {
  return (
    <AdminShell>
      <VendorSupersededNotice module="Vendor orders" />
    </AdminShell>
  );
}

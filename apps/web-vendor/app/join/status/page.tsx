import { VendorJoinStatusPanel } from '../../../src/vendor-join-status-panel';
import { VendorPublicShell } from '../../../src/vendor-public-shell';

export default function VendorJoinStatusPage() {
  return (
    <VendorPublicShell>
      <VendorJoinStatusPanel />
    </VendorPublicShell>
  );
}

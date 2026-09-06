import { VendorMarketingHome } from '../src/vendor-marketing-home';
import { VendorPublicShell } from '../src/vendor-public-shell';
import { fetchVendorMarketingCopy } from '../src/vendor-cms';

export default async function VendorHomePage() {
  const cms = await fetchVendorMarketingCopy('IN');
  return (
    <VendorPublicShell>
      <VendorMarketingHome cms={cms} />
    </VendorPublicShell>
  );
}

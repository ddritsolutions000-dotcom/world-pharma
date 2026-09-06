import { Heading, Text } from '@world-pharma/ui-kit/web';
import { VENDOR_TAB_META, type VendorTabId } from './vendor-workspace-nav';
import { VendorNavIconGlyph } from './vendor-sidebar-icons';

export function VendorPageHeader({ tab }: { tab: VendorTabId }) {
  const meta = VENDOR_TAB_META[tab];
  return (
    <header className="vws-page-header">
      <div className="vws-page-header-icon" aria-hidden>
        <VendorNavIconGlyph icon={meta.icon} />
      </div>
      <div>
        <Heading level={1}>{meta.label}</Heading>
        <Text tone="secondary" className="vws-page-header-desc">
          {meta.description}
        </Text>
      </div>
    </header>
  );
}

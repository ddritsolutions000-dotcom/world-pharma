import type { ReactNode } from 'react';
import { VendorWorkspaceLayout } from '../../src/vendor-workspace-layout';

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <VendorWorkspaceLayout>{children}</VendorWorkspaceLayout>;
}

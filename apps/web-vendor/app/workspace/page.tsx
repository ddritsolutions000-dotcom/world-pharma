'use client';

import { Suspense } from 'react';
import { LoadingState } from '@world-pharma/ui-kit/web';
import { VendorWorkspaceTabContent } from '../../src/vendor-workspace-tab-content';

export default function WorkspaceDashboardPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading seller dashboard…" />}>
      <VendorWorkspaceTabContent tab="dashboard" />
    </Suspense>
  );
}

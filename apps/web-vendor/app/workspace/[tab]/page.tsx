'use client';

import { Suspense, use, useEffect } from 'react';
import { notFound, useRouter } from 'next/navigation';
import { VendorWorkspaceTabContent } from '../../../src/vendor-workspace-tab-content';
import { isVendorTabId } from '../../../src/vendor-workspace-nav';

export default function WorkspaceTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = use(params);
  const router = useRouter();

  useEffect(() => {
    if (tab === 'dashboard') {
      router.replace('/workspace');
    }
  }, [router, tab]);

  if (!isVendorTabId(tab)) {
    notFound();
  }

  if (tab === 'dashboard') {
    return null;
  }

  return (
    <Suspense fallback={<div className="vws-page" />}>
      <VendorWorkspaceTabContent tab={tab} />
    </Suspense>
  );
}

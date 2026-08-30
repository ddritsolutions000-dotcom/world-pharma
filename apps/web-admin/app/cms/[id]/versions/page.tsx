import { Suspense } from 'react';
import { AdminShell } from '../../../../src/admin-shell';
import { CmsAdminVersions } from '../../../../src/cms-admin-versions';

export default async function CmsVersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <CmsAdminVersions contentId={id} />
      </Suspense>
    </AdminShell>
  );
}

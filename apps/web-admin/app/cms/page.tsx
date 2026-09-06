import { Suspense } from 'react';
import { AdminShell } from '../../src/admin-shell';
import { CmsAdminList } from '../../src/cms-admin-list';

export default function CmsPage() {
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <CmsAdminList />
      </Suspense>
    </AdminShell>
  );
}

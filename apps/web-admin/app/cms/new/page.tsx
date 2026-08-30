import { Suspense } from 'react';
import { AdminShell } from '../../../src/admin-shell';
import { CmsAdminCreate } from '../../../src/cms-admin-editor';

export default function CmsNewPage() {
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <CmsAdminCreate />
      </Suspense>
    </AdminShell>
  );
}

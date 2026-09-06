import { Suspense } from 'react';
import { AdminShell } from '../../../src/admin-shell';
import { CmsSitePagesDesk } from '../../../src/cms-site-pages-desk';

export default function CmsSitePagesRoute() {
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <CmsSitePagesDesk />
      </Suspense>
    </AdminShell>
  );
}

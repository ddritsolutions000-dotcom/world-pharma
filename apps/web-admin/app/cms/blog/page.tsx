import { Suspense } from 'react';
import { AdminShell } from '../../../src/admin-shell';
import { CmsBlogDesk } from '../../../src/cms-blog-desk';

export default function CmsBlogPage() {
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <CmsBlogDesk />
      </Suspense>
    </AdminShell>
  );
}

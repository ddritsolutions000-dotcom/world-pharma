import { Suspense } from 'react';
import { AdminShell } from '../../../src/admin-shell';
import { CmsHealthDesk } from '../../../src/cms-health-desk';

export default function CmsHealthPage() {
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <CmsHealthDesk />
      </Suspense>
    </AdminShell>
  );
}

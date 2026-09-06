import { Suspense } from 'react';
import { AdminShell } from '../../../src/admin-shell';
import { CmsLegalDesk } from '../../../src/cms-legal-desk';

export default function CmsLegalPage() {
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <CmsLegalDesk />
      </Suspense>
    </AdminShell>
  );
}

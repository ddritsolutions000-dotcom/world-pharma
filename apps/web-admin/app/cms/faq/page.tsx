import { Suspense } from 'react';
import { AdminShell } from '../../../src/admin-shell';
import { CmsFaqDesk } from '../../../src/cms-faq-desk';

export default function CmsFaqPage() {
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <CmsFaqDesk />
      </Suspense>
    </AdminShell>
  );
}

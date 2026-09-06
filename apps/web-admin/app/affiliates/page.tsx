import { Suspense } from 'react';
import { AdminShell } from '../../src/admin-shell';
import { AffiliateAdminHub } from '../../src/affiliate-list';

export default function AffiliatesPage() {
  return (
    <AdminShell currentNav="affiliates">
      <Suspense fallback={null}>
        <AffiliateAdminHub />
      </Suspense>
    </AdminShell>
  );
}

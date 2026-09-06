import { Suspense } from 'react';
import { AdminShell } from '../../src/admin-shell';
import { MarketingHub } from '../../src/marketing-list';

export default function MarketingPage() {
  return (
    <AdminShell currentNav="marketing">
      <Suspense fallback={null}>
        <MarketingHub />
      </Suspense>
    </AdminShell>
  );
}

import { Suspense } from 'react';
import { LoadingState } from '@world-pharma/ui-kit/web';
import { AdminShell } from '../../src/admin-shell';
import { ReliabilityAdminPanel } from '../../src/reliability-admin';

export default function ReliabilityPage() {
  return (
    <AdminShell currentNav="reliability">
      <Suspense fallback={<LoadingState label="Loading reliability" />}>
        <ReliabilityAdminPanel />
      </Suspense>
    </AdminShell>
  );
}

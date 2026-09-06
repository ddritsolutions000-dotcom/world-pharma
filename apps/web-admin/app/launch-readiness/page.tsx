import { Suspense } from 'react';
import { LoadingState } from '@world-pharma/ui-kit/web';
import { AdminShell } from '../../src/admin-shell';
import { FinalLaunchReadinessPanel } from '../../src/final-launch-readiness-admin';

export default function FinalLaunchReadinessPage() {
  return (
    <AdminShell currentNav="launch-readiness">
      <Suspense fallback={<LoadingState label="Loading final launch readiness" />}>
        <FinalLaunchReadinessPanel />
      </Suspense>
    </AdminShell>
  );
}

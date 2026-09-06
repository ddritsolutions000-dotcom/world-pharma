import { Suspense } from 'react';
import { JoinApplyWizard } from '../../src/join-apply-wizard';
import { JoinShell } from '../../src/join-shell';
import { LoadingState } from '@world-pharma/ui-kit/web';

export default function ApplyPage() {
  return (
    <JoinShell>
      <Suspense fallback={<LoadingState label="Loading application wizard" />}>
        <JoinApplyWizard />
      </Suspense>
    </JoinShell>
  );
}

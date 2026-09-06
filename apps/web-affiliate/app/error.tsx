'use client';

import { ErrorState } from '@world-pharma/ui-kit/web';

export default function ErrorView({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Affiliate portal error"
      description="Please retry. Internal details are not shown."
      action={{ label: 'Retry', onClick: reset }}
    />
  );
}

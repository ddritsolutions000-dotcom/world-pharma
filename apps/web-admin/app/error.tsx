'use client';

import { ErrorState } from '@world-pharma/ui-kit/web';

export default function ErrorView({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Admin shell error"
      description="Please retry. Internal details are not shown."
      action={{ label: 'Retry', onClick: reset }}
    />
  );
}

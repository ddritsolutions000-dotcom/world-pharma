'use client';

import { ErrorState } from '@world-pharma/ui-kit/web';

export default function ErrorView({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Something went wrong"
      description="Please try again. Technical details are not shown."
      action={{ label: 'Retry', onClick: reset }}
    />
  );
}

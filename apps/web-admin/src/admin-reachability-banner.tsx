'use client';

import { NetworkErrorState } from '@world-pharma/ui-kit/web';

export function AdminReachabilityBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <NetworkErrorState
      description="The API did not respond. Add, edit, and filters stay on this page. Start the API on port 4000 if it is stopped, then retry."
      action={{ label: 'Retry', onClick: onRetry }}
    />
  );
}

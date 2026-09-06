'use client';

import { EmptyState, LoadingState } from '@world-pharma/ui-kit/web';

export function PortalLoading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="shell-main">
      <LoadingState label={label} />
    </div>
  );
}

export function PortalNotFound({
  title = 'Page not found',
  description = 'This route does not exist in this portal.',
  homeHref = '/',
  homeLabel = 'Back to home',
}: {
  title?: string;
  description?: string;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <div className="shell-main">
      <EmptyState
        title={title}
        description={description}
        action={{ label: homeLabel, onClick: () => { window.location.href = homeHref; } }}
      />
    </div>
  );
}

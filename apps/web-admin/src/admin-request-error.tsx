'use client';

import { ErrorState, PermissionDeniedState } from '@world-pharma/ui-kit/web';
import { classifyAdminViewState, isAdminNetworkFailure } from './admin-http';
import { AdminReachabilityBanner } from './admin-reachability-banner';

function errorDescription(error: unknown): string {
  if (typeof error === 'string' && error.trim() && error !== 'true') {
    return error;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'The API returned an error. Retry after checking this route and your access.';
}

export function AdminRequestError({
  error = true,
  onRetry,
}: {
  error?: unknown;
  onRetry: () => void;
}) {
  if (classifyAdminViewState(error) === 'forbidden') {
    return <PermissionDeniedState />;
  }
  if (isAdminNetworkFailure(error)) {
    return <AdminReachabilityBanner onRetry={onRetry} />;
  }
  return (
    <ErrorState
      title="Could not load this area"
      description={errorDescription(error)}
      action={{ label: 'Retry', onClick: onRetry }}
    />
  );
}

export function AdminViewLoadError({
  viewState,
  onRetry,
  detail,
}: {
  viewState: string;
  onRetry: () => void;
  detail?: string;
}) {
  if (viewState === 'network') {
    return <AdminReachabilityBanner onRetry={onRetry} />;
  }
  if (viewState === 'error') {
    return (
      <ErrorState
        title="Could not load this area"
        description={detail ?? 'The API returned an error. Retry after checking this route and your access.'}
        action={{ label: 'Retry', onClick: onRetry }}
      />
    );
  }
  return null;
}

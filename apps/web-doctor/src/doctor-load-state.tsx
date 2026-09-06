'use client';

import {
  EmptyState,
  ErrorState,
  NetworkErrorState,
  PermissionDeniedState,
} from '@world-pharma/ui-kit/web';

export type DoctorLoadError = 'network' | 'forbidden' | 'error' | 'unauthorized';

export function mapDoctorApiFailure(kind: string | undefined): DoctorLoadError {
  if (kind === 'forbidden') return 'forbidden';
  if (kind === 'network') return 'network';
  if (kind === 'unauthorized') return 'unauthorized';
  return 'error';
}

export function DoctorLoadFailure({
  error,
  onRetry,
  detail,
  forbiddenTitle = 'Doctor access unavailable',
  forbiddenDescription = 'Sign in with a verified doctor partner email (sandbox: sandbox-doctor@dev.local).',
}: {
  error: DoctorLoadError | null;
  onRetry: () => void;
  detail?: string | null;
  forbiddenTitle?: string;
  forbiddenDescription?: string;
}) {
  if (error === 'forbidden') {
    return <PermissionDeniedState title={forbiddenTitle} description={detail ?? forbiddenDescription} />;
  }
  if (error === 'network') {
    return <NetworkErrorState action={{ label: 'Retry', onClick: onRetry }} />;
  }
  if (error === 'unauthorized') {
    return (
      <EmptyState
        title="Session expired"
        description="Sign in again with your doctor partner email."
        action={{ label: 'Retry', onClick: onRetry }}
      />
    );
  }
  if (error === 'error') {
    return (
      <ErrorState
        title="Could not load this page"
        description={
          detail?.trim() ||
          'The doctor API returned an error. Sign out and sign in with sandbox-doctor@dev.local, then retry.'
        }
        action={{ label: 'Retry', onClick: onRetry }}
      />
    );
  }
  return null;
}

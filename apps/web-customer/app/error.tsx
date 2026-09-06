'use client';

import { useEffect } from 'react';
import { Page, MgBtn } from '../src/ui/mg-ui';

export default function ErrorView({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Page>
      <div className="mg-empty-page">
        <span className="mg-empty-code">!</span>
        <h1 className="mg-page-title">Something went wrong</h1>
        <p className="mg-page-subtitle">Please try again. If the problem continues, contact support.</p>
        <div className="mg-empty-actions">
          <MgBtn onClick={reset}>Try again</MgBtn>
          <MgBtn href="/account/support" variant="ghost">
            Contact support
          </MgBtn>
        </div>
      </div>
    </Page>
  );
}

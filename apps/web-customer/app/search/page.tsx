import { Suspense } from 'react';
import { LoadingState } from '@world-pharma/ui-kit/web';
import { SearchResultsPage } from '../../src/search-results-page';

export default function Page() {
  return (
    <Suspense fallback={<LoadingState label="Loading search…" />}>
      <SearchResultsPage />
    </Suspense>
  );
}

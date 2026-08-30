import { Suspense } from 'react';
import { HelpSearchScreen } from '../../../src/help-search-page';

export default function HelpSearchPage() {
  return (
    <Suspense fallback={null}>
      <HelpSearchScreen />
    </Suspense>
  );
}

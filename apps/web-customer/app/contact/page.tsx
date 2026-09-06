import { Suspense } from 'react';
import { ContactPage } from '../../src/company-pages';
import { LoadingState } from '@world-pharma/ui-kit/web';

export default function Page() {
  return (
    <Suspense fallback={<LoadingState label="Loading contact…" />}>
      <ContactPage />
    </Suspense>
  );
}

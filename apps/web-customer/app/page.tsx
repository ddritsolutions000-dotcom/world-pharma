import { Suspense } from 'react';
import { LoadingState } from '@world-pharma/ui-kit/web';
import { StoreHome } from '../src/store-home';

export default function Page() {
  return (
    <Suspense fallback={<LoadingState label="Loading store" />}>
      <StoreHome />
    </Suspense>
  );
}

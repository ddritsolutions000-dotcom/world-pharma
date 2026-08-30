import { Suspense } from 'react';
import { MarketingHub } from '../../src/marketing-list';

export default function MarketingPage() {
  return (
    <Suspense fallback={null}>
      <MarketingHub />
    </Suspense>
  );
}

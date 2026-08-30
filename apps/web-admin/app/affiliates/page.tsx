import { Suspense } from 'react';
import { AffiliateAdminHub } from '../../src/affiliate-list';

export default function AffiliatesPage() {
  return (
    <Suspense fallback={null}>
      <AffiliateAdminHub />
    </Suspense>
  );
}

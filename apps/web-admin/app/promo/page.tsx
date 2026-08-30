import { Suspense } from 'react';
import { PromoHub } from '../../src/promo-list';

export default function PromoPage() {
  return (
    <Suspense fallback={null}>
      <PromoHub />
    </Suspense>
  );
}

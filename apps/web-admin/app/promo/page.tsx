import { Suspense } from 'react';
import { AdminShell } from '../../src/admin-shell';
import { PromoHub } from '../../src/promo-list';

export default function PromoPage() {
  return (
    <AdminShell currentNav="promo">
      <Suspense fallback={null}>
        <PromoHub />
      </Suspense>
    </AdminShell>
  );
}

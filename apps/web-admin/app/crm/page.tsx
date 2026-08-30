import { Suspense } from 'react';
import { CrmCustomerList } from '../../src/crm-customer-list';

export default function CrmPage() {
  return (
    <Suspense fallback={null}>
      <CrmCustomerList />
    </Suspense>
  );
}

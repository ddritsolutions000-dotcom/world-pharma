import { Suspense } from 'react';
import { AdminShell } from '../../src/admin-shell';
import { CrmCustomerList } from '../../src/crm-customer-list';

export default function CrmPage() {
  return (
    <AdminShell currentNav="crm">
      <Suspense fallback={null}>
        <CrmCustomerList />
      </Suspense>
    </AdminShell>
  );
}

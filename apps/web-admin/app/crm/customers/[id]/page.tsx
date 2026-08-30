import { Suspense } from 'react';
import { CrmCustomerDetail } from '../../../../src/crm-customer-detail';

export default async function CrmCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <CrmCustomerDetail personId={id} />
    </Suspense>
  );
}

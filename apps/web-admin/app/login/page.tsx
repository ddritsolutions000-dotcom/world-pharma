'use client';

import { Suspense } from 'react';
import { LoadingState } from '@world-pharma/ui-kit/web';
import { AdminEnterpriseAuth } from '../../src/admin-enterprise-auth';

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading sign-in…" />}>
      <AdminEnterpriseAuth />
    </Suspense>
  );
}

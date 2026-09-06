import { Suspense } from 'react';
import { LoadingState } from '@world-pharma/ui-kit/web';
import { AdminShell } from '../../src/admin-shell';
import { CountryControlCenter } from '../../src/country-control-center';

export default function CountriesPage() {
  return (
    <AdminShell currentNav="countries">
      <Suspense fallback={<LoadingState label="Loading country control" />}>
        <CountryControlCenter />
      </Suspense>
    </AdminShell>
  );
}

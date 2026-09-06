import { AdminShell } from '../../src/admin-shell';
import { ImagingAdminPanel } from '../../src/imaging-admin';

export default function ImagingPage() {
  return (
    <AdminShell>
      <ImagingAdminPanel />
    </AdminShell>
  );
}

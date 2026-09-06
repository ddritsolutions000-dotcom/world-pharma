import { AdminShell } from '../../../src/admin-shell';
import { CmsMediaLibrary } from '../../../src/cms-media-library';

export default function CmsMediaPage() {
  return (
    <AdminShell currentNav="cms-media">
      <CmsMediaLibrary />
    </AdminShell>
  );
}

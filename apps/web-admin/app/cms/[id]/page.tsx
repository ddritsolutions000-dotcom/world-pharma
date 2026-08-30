import { Suspense } from 'react';
import { AdminShell } from '../../../src/admin-shell';
import { CmsAdminEditor } from '../../../src/cms-admin-editor';

export default async function CmsEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <CmsAdminEditor contentId={id} />
      </Suspense>
    </AdminShell>
  );
}

import { AdminShell } from '../../src/admin-shell';
import { VideoAdminPanel } from '../../src/video-admin';

export default function VideoSessionsPage() {
  return (
    <AdminShell currentNav="video-sessions">
      <VideoAdminPanel />
    </AdminShell>
  );
}

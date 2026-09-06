import { DoctorInboxPanel } from '../../src/inbox-panel';
import { DoctorShell } from '../../src/doctor-shell';

export default function DoctorInboxRoute() {
  return (
    <DoctorShell
      title="Inbox"
      description="In-app notifications for your doctor account. Previews stay generic."
      currentNav="inbox"
    >
      <DoctorInboxPanel />
    </DoctorShell>
  );
}

import { DoctorShell } from '../../src/doctor-shell';
import { DoctorSettingsPanel } from '../../src/settings-panel';

export default function Page() {
  return (
    <DoctorShell title="Settings" description="Session, notifications, and profile shortcuts." currentNav="settings">
      <DoctorSettingsPanel />
    </DoctorShell>
  );
}

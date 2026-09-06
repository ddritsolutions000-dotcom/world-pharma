import { DoctorShell } from '../../src/doctor-shell';
import { DoctorSupportPanel } from '../../src/support-panel';

export default function DoctorSupportPage() {
  return (
    <DoctorShell title="Support" description="Open tickets for portal or clinical workflow issues." currentNav="support">
      <DoctorSupportPanel />
    </DoctorShell>
  );
}

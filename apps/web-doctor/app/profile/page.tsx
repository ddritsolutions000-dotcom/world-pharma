import { DoctorShell } from '../../src/doctor-shell';
import { DoctorProfilePanel } from '../../src/profile-panel';

export default function Page() {
  return (
    <DoctorShell title="Profile" description="Professional display fields only. Gender is optional.">
      <DoctorProfilePanel />
    </DoctorShell>
  );
}

import { DoctorAppointmentsPanel } from '../../src/appointments-panel';
import { DoctorShell } from '../../src/doctor-shell';

export default function DoctorAppointmentsRoute() {
  return (
    <DoctorShell
      title="Appointments"
      description="Your schedule only. Start consult is a placeholder for later video."
    >
      <DoctorAppointmentsPanel />
    </DoctorShell>
  );
}

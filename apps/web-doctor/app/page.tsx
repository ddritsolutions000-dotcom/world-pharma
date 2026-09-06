import { DoctorHomeDashboard } from '../src/doctor-home-dashboard';
import { DoctorShell } from '../src/doctor-shell';

export default function Page() {
  return (
    <DoctorShell title="Good day, Doctor" description="Your schedule and notifications at a glance." currentNav="home">
      <DoctorHomeDashboard />
    </DoctorShell>
  );
}

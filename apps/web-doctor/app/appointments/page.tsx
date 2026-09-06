import { Suspense } from 'react';
import { DoctorAppointmentsPanel } from '../../src/appointments-panel';
import { DoctorShell } from '../../src/doctor-shell';

export default function DoctorAppointmentsRoute() {
  return (
    <DoctorShell
      title="Appointments"
      description="Manage your schedule, consultations, and encounters."
    >
      <Suspense fallback={null}>
        <DoctorAppointmentsPanel />
      </Suspense>
    </DoctorShell>
  );
}

import { DoctorAvailabilityPanel } from '../../src/availability-panel';
import { DoctorShell } from '../../src/doctor-shell';

export default function AvailabilityRoute() {
  return (
    <DoctorShell
      title="Availability"
      description="Weekly windows and exceptions. Slot generation is timezone-aware."
    >
      <DoctorAvailabilityPanel />
    </DoctorShell>
  );
}

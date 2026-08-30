import { DoctorPrescriptionsPanel } from '../../src/prescriptions-panel';
import { DoctorShell } from '../../src/doctor-shell';

export default function DoctorPrescriptionsRoute() {
  return (
    <DoctorShell
      title="Prescriptions"
      description="Create, issue, amend, and cancel prescriptions for your encounters. R5-A foundation only."
    >
      <DoctorPrescriptionsPanel />
    </DoctorShell>
  );
}

import { DoctorRefillRequestsPanel } from '../../src/refill-requests-panel';
import { DoctorShell } from '../../src/doctor-shell';

export default function DoctorRefillRequestsRoute() {
  return (
    <DoctorShell
      title="Refill requests"
      description="Review and authorize patient refill requests. ED-R5E-01 fail-closed — explicit approve/reject only."
    >
      <DoctorRefillRequestsPanel />
    </DoctorShell>
  );
}

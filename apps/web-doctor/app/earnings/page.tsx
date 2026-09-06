import { DoctorEarningsPanel } from '../../src/earnings-panel';
import { DoctorShell } from '../../src/doctor-shell';

export default function EarningsPage() {
  return (
    <DoctorShell
      title="Earnings & wallet"
      description="Consult fees credit your doctor wallet. Withdraw whenever you want (sandbox mock payout)."
      currentNav="earnings"
    >
      <DoctorEarningsPanel />
    </DoctorShell>
  );
}

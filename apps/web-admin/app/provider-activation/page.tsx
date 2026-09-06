import { AdminShell } from '../../src/admin-shell';
import { ProviderActivationPanel } from '../../src/provider-activation-admin';

export default function ProviderActivationPage() {
  return (
    <AdminShell currentNav="provider-activation">
      <ProviderActivationPanel />
    </AdminShell>
  );
}

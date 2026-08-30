import { AdminShell } from '../../src/admin-shell';
import { FinanceAdminPanel } from '../../src/finance-admin';

export default function FinancePage() {
  return (
    <>
      <AdminShell />
      <FinanceAdminPanel />
    </>
  );
}

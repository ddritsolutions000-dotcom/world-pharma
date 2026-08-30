import { Suspense } from 'react';
import { AdminShell } from '../../../src/admin-shell';
import { SupportDeskTicket } from '../../../src/support-desk-ticket';

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <SupportDeskTicket ticketId={id} />
      </Suspense>
    </AdminShell>
  );
}

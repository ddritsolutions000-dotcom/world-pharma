import { AppointmentDetailScreen } from '../../../src/appointment-detail-page';

export default async function AppointmentDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AppointmentDetailScreen appointmentId={id} />;
}

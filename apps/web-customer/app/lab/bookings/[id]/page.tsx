import { LabBookingDetailScreen } from '../../../../src/lab-bookings-page';

export default async function LabBookingDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LabBookingDetailScreen id={id} />;
}

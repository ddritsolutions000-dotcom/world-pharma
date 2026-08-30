import { ImagingBookingDetailScreen } from '../../../../src/imaging-bookings-page';

export default async function RadiologyBookingDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ImagingBookingDetailScreen id={id} />;
}

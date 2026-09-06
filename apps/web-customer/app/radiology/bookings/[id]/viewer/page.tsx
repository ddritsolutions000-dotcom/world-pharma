import { ImagingBookingViewerScreen } from '../../../../../src/imaging-booking-viewer-page';

export default async function RadiologyBookingViewerRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ImagingBookingViewerScreen bookingId={id} />;
}

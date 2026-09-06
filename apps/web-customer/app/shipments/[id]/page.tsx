import { ShipmentDetailScreen } from '../../../src/shipment-detail-page';

export default async function ShipmentDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ShipmentDetailScreen shipmentId={id} />;
}

import { OrderDetailScreen } from '../../../src/order-detail-page';

export default async function OrderDetailRoute({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  return <OrderDetailScreen orderNumber={orderNumber} />;
}

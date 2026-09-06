import { humanizeRouteSegment } from '@world-pharma/shell-web';
import type { DeliveryTab } from './navigation';

const TAB_LABELS: Record<DeliveryTab, string> = {
  jobs: 'Jobs',
  presence: 'Presence',
  inbox: 'Inbox',
  support: 'Support',
};

export function deliveryBreadcrumbLabel(tab: DeliveryTab, detail?: string): string {
  const base = TAB_LABELS[tab] ?? humanizeRouteSegment(tab);
  return detail ? `Delivery › ${base} › ${detail}` : `Delivery › ${base}`;
}

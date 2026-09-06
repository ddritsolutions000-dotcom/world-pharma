import type { InboxItem } from './account-api';
import type { MobileScreen, ViewState } from './navigation';

export type InboxDestination =
  | MobileScreen
  | { screen: 'lab-booking-detail'; bookingId: string }
  | { screen: 'imaging-booking-detail'; bookingId: string }
  | { screen: 'appointment-detail'; appointmentId: string }
  | { screen: 'shipment-detail'; shipmentId: string }
  | { screen: 'order-detail'; orderId: string }
  | { screen: 'health-artifact-detail'; artifactId: string };

export function unreadInboxCount(items: InboxItem[]): number {
  return items.filter((item) => !item.read).length;
}

export function groupInbox(items: InboxItem[]): { unread: InboxItem[]; read: InboxItem[] } {
  return {
    unread: items.filter((item) => !item.read),
    read: items.filter((item) => item.read),
  };
}

export function formatInboxWhen(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleString();
}

export function inboxCategoryLabel(type: string | undefined): string | null {
  if (!type) {
    return null;
  }
  const labels: Record<string, string> = {
    appointment: 'Appointment',
    video: 'Video consult',
    order: 'Order',
    lab_booking: 'Lab booking',
    imaging_booking: 'Imaging booking',
    prescription: 'Prescription',
    health_artifact: 'Health report',
    care_plan: 'Care plan',
    shipment: 'Shipment',
    support: 'Support',
    partner_application: 'Partner application',
    crm_campaign: 'Update',
  };
  return labels[type] ?? type.replaceAll('_', ' ');
}

export function customerInboxDestination(item: InboxItem): InboxDestination | null {
  if (item.reference_type === 'appointment' && item.reference_id) {
    return { screen: 'appointment-detail', appointmentId: item.reference_id };
  }
  if (item.reference_type === 'video' && item.reference_id) {
    return { screen: 'appointment-detail', appointmentId: item.reference_id };
  }
  if (item.reference_type === 'appointment' || item.reference_type === 'video') {
    return 'appointments';
  }
  if (item.reference_type === 'prescription') {
    return 'prescriptions';
  }
  if (item.reference_type === 'health_artifact' && item.reference_id) {
    return { screen: 'health-artifact-detail', artifactId: item.reference_id };
  }
  if (item.reference_type === 'health_artifact' || item.reference_type === 'care_plan') {
    return 'health-home';
  }
  if (item.reference_type === 'lab_booking' && item.reference_id) {
    return { screen: 'lab-booking-detail', bookingId: item.reference_id };
  }
  if (item.reference_type === 'lab_booking') {
    return 'lab-bookings';
  }
  if (item.reference_type === 'imaging_booking' && item.reference_id) {
    return { screen: 'imaging-booking-detail', bookingId: item.reference_id };
  }
  if (item.reference_type === 'imaging_booking') {
    return 'imaging-bookings';
  }
  if (item.reference_type === 'order' && item.reference_id) {
    return { screen: 'order-detail', orderId: item.reference_id };
  }
  if (item.reference_type === 'order' || item.reference_type === 'payment') {
    return item.reference_id
      ? { screen: 'order-detail', orderId: item.reference_id }
      : 'orders';
  }
  if (item.reference_type === 'shipment' && item.reference_id) {
    return { screen: 'shipment-detail', shipmentId: item.reference_id };
  }
  if (item.reference_type === 'shipment') {
    return 'shipments';
  }
  if (item.reference_type === 'support') {
    return 'support';
  }
  return null;
}

export function inboxView(viewState: ViewState, items: InboxItem[]) {
  const grouped = groupInbox(items);
  return {
    showLoading: viewState === 'loading',
    showNetwork: viewState === 'network',
    showForbidden: viewState === 'forbidden',
    showEmpty: viewState === 'idle' && items.length === 0,
    unread: viewState === 'idle' ? grouped.unread : [],
    read: viewState === 'idle' ? grouped.read : [],
  };
}

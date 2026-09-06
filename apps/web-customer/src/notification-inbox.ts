import type { InboxItem } from './account-api';

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

export function customerInboxHref(item: InboxItem): string | null {
  const type = item.reference_type;
  const id = item.reference_id;
  if (type === 'appointment' && id) {
    return `/appointments/${id}`;
  }
  if (type === 'video' && id) {
    return `/appointments/${id}`;
  }
  if (type === 'video') {
    return '/appointments';
  }
  if (type === 'prescription' && id) {
    return `/prescriptions?id=${id}`;
  }
  if (type === 'prescription') {
    return '/prescriptions';
  }
  if (type === 'health_artifact' && id) {
    return `/health/artifacts/${id}`;
  }
  if (type === 'health_artifact') {
    return '/health';
  }
  if (type === 'care_plan') {
    return '/health';
  }
  if (type === 'order' && id) {
    return `/orders/${id}`;
  }
  if (type === 'order') {
    return '/orders';
  }
  if (type === 'payment') {
    return id ? `/orders/${id}` : '/orders';
  }
  if (type === 'imaging_booking' && id) {
    return `/radiology/bookings/${id}`;
  }
  if (type === 'imaging_booking') {
    return '/radiology/bookings';
  }
  if (type === 'lab_booking' && id) {
    return `/lab/bookings/${id}`;
  }
  if (type === 'lab_booking') {
    return '/lab/bookings';
  }
  if (type === 'shipment' && id) {
    return `/shipments/${id}`;
  }
  if (type === 'shipment') {
    return '/shipments';
  }
  if (type === 'support') {
    return '/account/support';
  }
  return null;
}

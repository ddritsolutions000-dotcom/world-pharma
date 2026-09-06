import type { InboxItem } from './doctor-api';

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
    shipment: 'Shipment',
    support: 'Support',
    credential: 'Credential',
  };
  return labels[type] ?? type.replaceAll('_', ' ').toLowerCase();
}

export function doctorInboxHref(item: InboxItem): string | null {
  const id = item.reference_id;
  if (item.reference_type === 'appointment' && id) {
    return `/appointments?id=${encodeURIComponent(id)}`;
  }
  if (item.reference_type === 'video' && id) {
    return `/appointments?id=${encodeURIComponent(id)}`;
  }
  if (item.reference_type === 'appointment' || item.reference_type === 'video') {
    return '/appointments';
  }
  if (item.reference_type === 'credential') {
    return '/credentials';
  }
  if (item.reference_type === 'support') {
    return '/support';
  }
  return null;
}

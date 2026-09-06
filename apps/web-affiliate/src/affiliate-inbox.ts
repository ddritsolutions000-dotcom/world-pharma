import type { AffiliateInboxItem } from './affiliate-api';

export function affiliateInboxHref(item: AffiliateInboxItem): string | null {
  if (item.reference_type === 'partner_application') {
    const joinUrl = process.env.NEXT_PUBLIC_JOIN_URL ?? 'http://localhost:3008';
    return `${joinUrl.replace(/\/$/, '')}/status`;
  }
  if (item.reference_type === 'order' || item.reference_type === 'support') {
    return '/support';
  }
  if (item.reference_type === 'affiliate' || item.reference_type === 'settlement' || item.reference_type === 'settlement_line') {
    return '/earnings';
  }
  return '/earnings';
}

export function groupAffiliateInbox(items: AffiliateInboxItem[]): {
  unread: AffiliateInboxItem[];
  read: AffiliateInboxItem[];
} {
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
    order: 'Order commission',
    support: 'Support',
    partner_application: 'Partner application',
    earnings: 'Earnings',
    affiliate: 'Commission',
    settlement: 'Settlement',
    settlement_line: 'Settlement',
  };
  return labels[type] ?? type.replaceAll('_', ' ');
}

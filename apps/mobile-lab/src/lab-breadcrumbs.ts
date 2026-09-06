import type { LabTab } from './navigation';

const TAB_LABELS: Record<LabTab, string> = {
  bookings: 'Bookings',
  collections: 'Collections',
  transport: 'Transport',
  accessions: 'Accession',
  processing: 'Processing',
  pathology: 'Pathology',
  inbox: 'Inbox',
  support: 'Support',
  more: 'More',
};

export function labBreadcrumbLabel(tab: LabTab, detail?: string): string {
  const base = TAB_LABELS[tab];
  return detail ? `Lab › ${base} › ${detail}` : `Lab › ${base}`;
}

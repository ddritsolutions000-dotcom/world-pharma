export function phlebotomistBreadcrumbLabel(tab: string, detail?: string): string {
  if (tab === 'inbox') {
    return 'Sample collection › Inbox';
  }
  if (tab === 'support') {
    return 'Sample collection › Support';
  }
  return detail ? `Sample collection › Jobs › ${detail}` : 'Sample collection › Jobs';
}

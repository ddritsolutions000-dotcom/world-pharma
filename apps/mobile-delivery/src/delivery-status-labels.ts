export function deliveryJobStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    CREATED: 'Created',
    ASSIGNED: 'Assigned',
    IN_PROGRESS: 'At pickup',
    PICKUP: 'Picked up',
    DELIVERED: 'Delivered',
    FAILED: 'Delivery failed',
    RETURNED: 'Returned to origin',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

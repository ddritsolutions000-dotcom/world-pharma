export function prescriptionStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

export function dispensingCaseStatusLabel(status: string): string {
  return status.replaceAll('_', ' ').toLowerCase();
}

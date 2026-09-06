import type { Serviceability } from './serviceability-api';

export function medicineEtaLabel(result: Serviceability | null, rxRequired?: boolean): string {
  if (rxRequired) return 'Prescription required';
  if (!result?.serviceable) return 'Add postal code for delivery ETA';
  switch (result.medicine_eta) {
    case 'same_day':
      return 'Get by today';
    case 'next_day':
      return 'Get by tomorrow';
    case '2_3_days':
      return 'Get in 2–3 days';
    default:
      return 'Not serviceable';
  }
}

/** Legacy helper when serviceability API is not loaded. */
export function deliveryEtaLabel(rxRequired: boolean, postalCode?: string | null): string {
  if (rxRequired) return 'Prescription required';
  if (postalCode?.trim()) return 'Get by tomorrow';
  return 'Add postal code for delivery ETA';
}
